# ADR 0010 · Credenciales de proveedor por cliente

**Estado:** propuesta con recomendación. Implementado en rama el módulo de cifrado (`src/lib/credentials/crypto.ts`), sin claves reales. La tabla y el flujo se implementarán tras la decisión del propietario.
**Fecha:** 09/10/2026.
**Desbloquea:** fase 2 del ADR 0007 (clave OpenSEO por cliente) y fase B del ADR 0009 (OAuth de Search Console y API key/OAuth de Bing).

## Problema

Cada cliente podrá aportar credenciales propias:
- refresh tokens OAuth de Google;
- API key de Bing;
- clave de OpenSEO.

Deben quedar ligadas a una organización, un proyecto y un proveedor. Solo el servidor debe poder usarlas, y deben poder revocarse y rotarse. Nunca pueden llegar al navegador, a Git, a los logs, a los errores ni a las exportaciones.

Restricción propia de esta plataforma ([ADR 0003](0003-auth-supabase-y-tenancy.md) y CLAUDE.md): la aplicación solo usa la clave publicable de Supabase con la sesión del usuario. Por tanto, **cualquier RPC que el servidor pueda llamar también la puede llamar el navegador con el mismo JWT**. Una RPC que devolviera el secreto en claro lo expondría al cliente.

## Alternativas

| Opción | Cómo funciona | Coste | Evaluación |
|---|---|---|---|
| A. Supabase Vault | Secretos cifrados en Postgres; vista `vault.decrypted_secrets` en claro para quien tenga permiso ([documentación](https://supabase.com/docs/guides/database/vault)) | Incluido en el proyecto | La documentación lo marca como **public alpha**. Para que el servidor descifre sin clave secreta, haría falta una RPC con acceso a la vista, y el navegador también podría llamarla. Solo serviría con un proceso de servidor que use la clave secreta de Supabase, hoy prohibida en la app |
| **B. Cifrado autenticado en la aplicación (recomendada)** | AES-256-GCM en el servidor, con keyring en una variable de servidor marcada como *Sensitive* en Vercel (mismo patrón que el HMAC de provenance, ya en producción). Postgres guarda solo el texto cifrado. Los datos asociados (credencial, organización, proyecto, proveedor, keyId) impiden mover un cifrado de un proyecto a otro | 0 € adicionales | El navegador, como mucho, obtiene texto cifrado inútil sin la clave. Encaja con la arquitectura actual sin abrir la clave secreta de Supabase. Riesgo: quien comprometa las variables de producción de Vercel obtiene la clave, el mismo riesgo que ya tiene el HMAC |
| C. KMS externo (Google Cloud KMS o AWS KMS) con cifrado por sobre | La clave maestra no sale del KMS; el servidor pide descifrar cada clave de datos | Tarifa por clave y por operación del proveedor (**por verificar** en la tarifa oficial antes de decidir) | Más aislamiento, pero exige otra cuenta, credenciales de servicio en Vercel (otra vez un secreto global) y más latencia. Recomendable cuando haya varios clientes de pago o un requisito contractual |
| D. Variables de entorno de Vercel por cliente | Una variable por cliente | Incluido | **Descartada:** credenciales globales del despliegue, redeploy por cada alta y sin aislamiento por proyecto en datos. El encargo lo prohíbe expresamente |

## Decisión propuesta: B, con paso a C si crece el riesgo

### Almacenamiento (fase siguiente, migración nueva)

- Tabla `private.provider_credentials(id, organization_id, project_id, provider, credential_kind, sealed jsonb, key_id, scopes text[], status, granted_by, granted_at, expires_at, revoked_by, revoked_at)`.
  - Con RLS, sin políticas y sin privilegios directos, como `openseo_project_connections`.
  - `sealed` solo admite la forma `{v, keyId, iv, ciphertext, tag}`; una restricción CHECK rechaza cualquier otra.
- RPC solo para el owner:
  - `store`: recibe el cifrado ya sellado en el servidor; nunca el secreto.
  - `get_sealed`: devuelve solo el cifrado.
  - `revoke` y `delete`.
  - El servidor abre el valor en memoria y lo usa en la misma petición, sin cachearlo.
- Una credencial activa por proyecto y proveedor. La revocación conserva la fila sin el cifrado (`sealed = null`) para auditoría, y el cambio queda en `audit_events`.

### Ciclo de vida

| Acción | Comportamiento |
|---|---|
| Alta (OAuth) | Callback de servidor con `state` y PKCE ligados a la sesión y al proyecto. El token se sella antes de tocar la base de datos. Solo alcances mínimos (`webmasters.readonly`, GA4 de solo lectura) |
| Uso | Servidor: sesión → `authorized` (owner o rol permitido) → `get_sealed` → `open` con el mismo binding → llamada al proveedor → descarte. Si falla, `NOT_CONNECTED` sin detalle |
| Renovación OAuth | El nuevo access token vive solo en memoria. Si Google rota el refresh token, se vuelve a sellar y guardar |
| Rotación de clave maestra | Se añade la nueva clave, se cambia la activa, se vuelven a sellar todas las credenciales (`reseal`) y solo después se retira la antigua. Hoy esto necesita una sesión de owner por proyecto, o un proceso de administración con clave secreta (decisión futura, ver límites) |
| Revocación | Revocación en el proveedor cuando exista endpoint (Google lo tiene) y borrado del cifrado. Las auditorías ya guardadas se conservan |
| Recuperación | El propietario guarda una copia de las claves maestras fuera de Vercel (gestor de contraseñas). Si se pierden, las credenciales no se recuperan: los clientes vuelven a conectar. Los datos firmados no dependen de estas claves |
| Borrado | Al borrar el proyecto, borrado en cascada. Las exportaciones del proyecto **no** incluyen esta tabla |

### Prevención de fugas

- Nada de `console` en estos módulos; los errores son códigos fijos (ya probado en el módulo).
- `NEXT_PUBLIC_*` con «CREDENTIAL» impide cargar el keyring (`CREDENTIAL_KEYS_PUBLIC`).
- El guard de secretos del repositorio y las pruebas usan claves generadas en el momento.
- Nunca se piden secretos por chat ni se escriben en documentación o capturas.

## Límites y decisiones pendientes

1. **Trabajos programados sin sesión.** Las lecturas periódicas (snapshots) no tienen sesión de usuario. Necesitarán un proceso de servidor con identidad propia: una Edge Function o un worker con clave secreta de Supabase acotada a esa función. Eso cambia una regla actual de la plataforma y debe aprobarse aparte; no forma parte de esta fase.
2. **Coste de C.** Si se elige KMS, consultar antes la tarifa vigente del proveedor; no se ha verificado aquí.
3. **App OAuth de Google.** Puede requerir verificación de Google según el alcance y el número de usuarios. Por verificar con la cuenta real del proyecto Google Cloud del propietario.

## Lo implementado en esta rama

- `src/lib/credentials/crypto.ts`:
  - `loadCredentialKeyring` con `CREDENTIALS_ENCRYPTION_KEYS` y `CREDENTIALS_ACTIVE_KEY_ID`, claves de 32 bytes exactos;
  - `seal`, `open` y `reseal` con AES-256-GCM, nonce aleatorio de 12 bytes y etiqueta de 16;
  - datos asociados canónicos;
  - `null` ante cualquier fallo.
- `tests/credentials-crypto.test.ts`:
  - cada campo del binding está autenticado;
  - manipular el cifrado, la etiqueta, el nonce o la versión se detecta;
  - nonce distinto en cada sellado;
  - rotación completa;
  - configuración incompleta o pública rechazada sin repetir valores.
- No se ha configurado ninguna variable en Vercel ni creado tablas.

## Acción del propietario

Aprobar B (o elegir A o C). Si se aprueba B, el siguiente PR añade la tabla, las RPC y el flujo OAuth sin credenciales reales. Configurar después las dos variables en Vercel, solo en producción y como *Sensitive*. Generar la clave en local, por ejemplo con `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`; nunca pegarla en el chat.
