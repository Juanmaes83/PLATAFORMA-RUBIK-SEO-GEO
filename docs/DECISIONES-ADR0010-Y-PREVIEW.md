# Decisiones pendientes: credenciales por cliente (ADR 0010) y Preview aislada (Bloque 2)

Fecha: 10/10/2026. **Solo documentación:** no crea servicios, cuentas, variables ni tablas. Este documento concreta las dos decisiones que tiene que tomar Juanma, con fuentes oficiales comprobadas hoy. Las fuentes están al final, cada una con su nivel de verificación.

## 1. ADR 0010 · Credenciales de proveedor por cliente

**Contexto:** el ADR está en el PR #40 (abierto desde el 09/10, con base antigua). Se necesita para guardar el refresh token OAuth de Google de cada cliente, la clave de Bing o la clave de OpenSEO por cliente. Hoy no hace falta para el piloto: Sarah lee GSC y GA4 a través de la conexión de OpenSEO, sin tokens propios en Rubik.

### Recomendación: opción B (cifrado AES-256-GCM en el servidor), con estas condiciones

| Aspecto | Recomendación concreta |
|---|---|
| **Almacén** | Tabla `private.provider_credentials` con RLS, sin políticas directas y RPC solo para la titularidad. Solo guarda el sobre cifrado `{v, keyId, iv, ciphertext, tag}`, ligado por datos asociados a credencial, organización, proyecto y proveedor. El navegador, con el mismo JWT, como mucho obtiene texto cifrado inútil |
| **Separación del HMAC** | Anillo **distinto**: `CREDENTIALS_ENCRYPTION_KEYS` y `CREDENTIALS_ACTIVE_KEY_ID`, nunca reutilizar `PROVENANCE_SIGNING_KEYS`. Copias de respaldo en entradas separadas del gestor de contraseñas. Perder el anillo de credenciales obliga a reconectar clientes. Perder el HMAC impide verificar el historial. Son riesgos distintos y no deben caer juntos |
| **Entornos** | Solo en Production, como variable *Sensitive*: no se puede volver a leer desde el panel ni la CLI. Preview **sin** anillo de credenciales mientras comparta la base con producción. Con una Preview aislada (§2), usar un anillo propio y distinto |
| **Rotación** | Añadir la clave nueva, cambiar la activa, volver a sellar todo y retirar la antigua. Hoy hace falta una sesión de titular por proyecto, porque no hay identidad de servidor. Frecuencia: anual, o inmediata ante sospecha de filtración |
| **Recuperación** | Si se pierde el anillo, no se recupera nada: se marcan las credenciales como inválidas y cada cliente vuelve a conectar. No afecta a datos firmados, exportaciones ni restauraciones, que no incluyen esta tabla |
| **Revocación** | Al revocar: `POST https://oauth2.googleapis.com/revoke` con el token y borrado del sobre. Revocar el access token revoca también el refresh token. La propagación no es instantánea |
| **Paso a KMS (opción C)** | El coste no es la barrera: en Google Cloud KMS una clave de software cuesta 0,06 $/mes y las operaciones 0,03 $ cada 10.000; AWS KMS, 1 $/mes por clave. La barrera es operativa: otra cuenta y una credencial de servicio en Vercel, que vuelve a ser un secreto global. Pasar a C cuando haya varios clientes de pago o un requisito contractual |

### Por qué no Vault (opción A)

La guía actual de Supabase Vault ya no muestra la etiqueta *alpha* en el texto, aunque su estado GA no está confirmado. El problema es de arquitectura, no de madurez. La guía dice textualmente que *«anyone that has access to the view has access to decrypted secrets»*. Como la aplicación solo usa la clave publicable con el JWT del usuario, cualquier RPC que descifre para el servidor también la puede llamar el navegador. Vault solo encaja si existe un proceso de servidor con clave secreta, que hoy está prohibido.

### Hechos de Google OAuth que condicionan la fase B del ADR 0009

- **Modo Testing:** los refresh tokens caducan a los **7 días**. No sirve para un cliente real: hay que publicar la app («In production»).
- **App no verificada con scopes sensibles o restringidos:** tiene un tope de **100 usuarios** para toda la vida del proyecto, sin reinicio. Verificar scopes sensibles tarda unos 10 días hábiles; los restringidos, unas 6 semanas y una auditoría anual de seguridad.
- **Clasificación de `webmasters.readonly` y `analytics.readonly`:** **no confirmada** en la documentación pública. Se ve en la pantalla de consentimiento de Cloud Console del proyecto de Juanma. Comprobarlo allí antes de decidir el calendario.
- **Pérdida de refresh tokens:** se pierden tras 6 meses sin uso, si el usuario revoca el acceso o al superar 100 tokens por cuenta y client ID (se invalida el más antiguo sin aviso). El diseño debe tratar `invalid_grant` como «reconectar», nunca como error mudo.

### Acción de Juanma

1. Aprobar B con las condiciones de la tabla, o elegir A o C.
2. Si se aprueba: rehacer el PR #40 sobre `main` actual. Su base es antigua; el módulo `crypto.ts` y sus pruebas se reutilizan. Añadir la migración con pgTAP sin configurar ninguna variable.
3. Configurar las dos variables (Production, *Sensitive*) solo cuando exista un flujo OAuth que las use. Generar la clave en local; nunca por chat.

## 2. Preview aislada

**Situación:** las Preview de Vercel usan la misma base de producción. Mientras sea así, rige la regla de no escribir desde una Preview y probar en local o en CI.

| Opción | Coste comprobado | Aislamiento | Contras |
|---|---|---|---|
| **A. Segundo proyecto Supabase `rubik-preview`** | **0 €** si queda una de las 2 plazas gratuitas activas (en una organización suman las de los Owner/Admin). En plan Pro: 25 $/mes por organización con 10 $ de créditos, que cubren un proyecto Micro; cada proyecto adicional cuesta unos 10 $/mes (Micro, 0,01344 $/h) | Total: base, Auth, Storage y claves propias | En Free se pausa tras 7 días sin actividad (aviso por correo; restaurable 90 días). Las migraciones las aplica Juanma con su CLI, igual que en producción |
| B. Branching de Supabase | Requiere **Pro** (25 $/mes) y además horas de cómputo por rama (Micro desde 0,01344 $/h). **Los créditos no se aplican y el límite de gasto no lo cubre** | Total y sin datos de producción: cada rama se siembra con `supabase/seed.sql` | Integración oficial con Vercel: actualiza las variables de Preview por PR y redespliega. Coste variable sin techo |
| C. Solo local y CI | 0 € | Total, pero sin Auth alojado | Lo actual. No permite revisar en el navegador con un Auth alojado aislado |

### Recomendación: A, en plan Free si hay plaza

- Es la única opción de coste cero, aísla por completo y no introduce un gasto sin techo como B. La pausa por inactividad es aceptable para un entorno de revisión: se restaura cuando se necesita.
- **Configuración** (la hace Juanma):
  - en Vercel, variables del entorno **Preview** con la URL y la clave publicable del nuevo proyecto. Vercel permite valores distintos para Preview y Production, e incluso por rama;
  - en Auth del proyecto de Preview, la URL de redirección comodín `https://*-<slug-del-equipo>.vercel.app/**`, que la documentación de Supabase da como ejemplo para Vercel. En producción, URL exacta;
  - dos cuentas de prueba sin datos de clientes;
  - anillo HMAC propio de Preview (nunca el de producción) solo si se quiere probar la firma allí.
- **Comprobar antes:** que hay plaza gratuita en la organización «Rubik Sota». La consulta del 09/10 devolvió plan `free`, pero no enumeró todos sus proyectos. Si no la hay, A cuesta unos 10 $/mes más la base Pro de 25 $/mes. En ese caso, comparar con quedarse en C hasta el primer cliente de pago.
- **Desbloquea:** la matriz de aislamiento con dos cuentas alojadas ([AISLAMIENTO-ALOJADO-GUION](AISLAMIENTO-ALOJADO-GUION.md)) sin tocar producción, y probar escrituras desde una Preview.

### Recordatorio de alojamiento

Vercel Hobby es solo para uso personal no comercial; el uso comercial exige Pro o Enterprise ([HOSTING](HOSTING.md)). Es independiente de esta decisión, pero condiciona la comercialización.

## Fuentes (consultadas el 10/10/2026)

**Verificado en el texto de la documentación oficial** (buscador oficial de Supabase y Vercel, y descarga directa de Google Cloud). Ninguna de estas páginas muestra fecha de actualización:

- [Supabase Vault](https://supabase.com/docs/guides/database/vault)
- [Cómputo y uso](https://supabase.com/docs/guides/platform/manage-your-usage/compute)
- [FAQ de facturación](https://supabase.com/docs/guides/platform/billing-faq)
- [Pausa de proyectos Free](https://supabase.com/docs/guides/platform/free-project-pausing)
- [Branching](https://supabase.com/docs/guides/deployment/branching)
- [Coste de branching](https://supabase.com/docs/guides/platform/manage-your-usage/branching)
- [Integraciones de branching](https://supabase.com/docs/guides/deployment/branching/integrations)
- [URL de redirección](https://supabase.com/docs/guides/auth/redirect-urls)
- [Variables Sensitive de Vercel](https://vercel.com/docs/environment-variables/sensitive-environment-variables)
- [Variables por entorno](https://vercel.com/docs/environment-variables/manage-across-environments)
- [Precios de Google Cloud KMS](https://cloud.google.com/kms/pricing)

**Extractos de buscador limitado a dominios oficiales; texto literal no comprobado en la página original:**

- [Uso justo de Vercel](https://vercel.com/docs/limits/fair-use-guidelines)
- [OAuth 2.0 de Google](https://developers.google.com/identity/protocols/oauth2)
- [Verificación de apps](https://support.google.com/cloud/answer/7454865)
- [Tope de usuarios no verificados](https://support.google.com/cloud/answer/13463817)
- [Precios de AWS KMS](https://aws.amazon.com/kms/pricing/)

**Contradicción detectada:** la documentación de Vercel describe a la vez las variables *Sensitive* (solo Production y Preview) y un modelo nuevo *Config*/*Secret*, en el que las *Sensitive* pasan a ser *Secret*. Comprobarlo en el panel al configurar.
