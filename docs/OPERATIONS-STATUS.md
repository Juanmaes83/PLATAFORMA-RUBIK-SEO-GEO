# Estado operativo comprobado — 09/10/2026

Este registro separa lo observado de lo pendiente; las autorizaciones del propietario para avanzar permanecen vigentes. No hay que volver a pedir permiso para preparar cambios de código, pruebas o PR dentro del alcance autorizado.

## Entrega actual

**Estado vigente (09/10/2026, tras aplicar el paquete de migraciones). Las viñetas siguientes son el histórico de cada entrega; prevalece este bloque.**

Supabase Rubik `yvdgmklgwlshizzgefpv`: el propietario aplicó con su CLI las cuatro migraciones del paquete. Codex confirmó que `migration list` muestra **nueve versiones sincronizadas** y que las tres tablas privadas nuevas o modificadas (`openseo_project_connections`, `openseo_project_jobs`, `webmaster_properties`) tienen RLS sin privilegios directos para `anon`/`authenticated`. Esta sesión no tiene acceso al proyecto: la evidencia procede del propietario y de Codex.

| Área | Integrado en `main` | Alojado / desplegado | Verificación real | Siguiente acción |
|---|---|---|---|---|
| OpenSEO jobs y guardado firmado | PR #27/#28/#30 | Migración de jobs aplicada; flag y HMAC en producción | **No:** falta una auditoría nueva vinculada al ledger | Prueba controlada del propietario (OPENSEO-ACTIVATION, sección A) |
| OpenSEO multiempresa (ADR 0007): conexión, cableado, negativas, panel | PR #32–#35 | Migraciones `20261009120000` y `150000` **aplicadas** por el propietario; producción `READY` en `8d56e18` con modo `legacy` | Panel en revisión por el propietario; ninguna conexión ni auditoría por proyecto verificada | Revisar el panel; después, activación controlada del modo `project` (OPENSEO-ACTIVATION, sección B) |
| Reconciliación de STARTING (ADR 0008) | PR #36 | Migración `20261009170000` **aplicada** | Solo CI y pgTAP; no ha hecho falta reconciliar nada real | Ninguna salvo que aparezca un STARTING incierto |
| Search Console y Bing, fases A y C (ADR 0009) | PR #37/#38 (`8d56e18`) | Migración `20261009180000` **aplicada**; sin OAuth, claves ni interfaz | Solo simulaciones, CI y pgTAP | Decidir el ADR 0010 (PR #40); luego OAuth (fase B) |
| Credenciales por cliente (ADR 0010) | No: PR #40 abierto | Sin migración ni variables | — | Decisión del propietario sobre la opción B |
| Previews | — | Comparten el Supabase de producción; sin variables de OpenSEO ni HMAC | — | Entorno aislado de pruebas (pendiente de decisión) |

### Histórico de entregas

- Search Console y Bing, fase A ([ADR 0009](adr/0009-search-console-bing-lectura.md), rama `claude/gsc-bing-lectura` desde `main`): transportes de servidor de solo lectura probados a través del Core con simulaciones. Sin OAuth, claves ni propiedades reales. La documentación oficial se contrastó por búsqueda acotada porque la descarga directa está bloqueada en este entorno.
- Reconciliación de lanzamientos inciertos ([ADR 0008](adr/0008-reconciliacion-openseo.md), rama `claude/openseo-reconciliacion`, apilada sobre #35). Migración `20261009170000` con dos RPC owner-only; pgTAP 15/15 en local; e2e en CI. Corrige además un fallo de interfaz anterior: los códigos sin texto ocultaban el mensaje específico del servidor tras «Error de OpenSEO.».
- OpenSEO multiempresa fase 3 (rama `claude/openseo-fase3-interfaz`, apilada sobre #34): panel del owner para conectar y revocar. Mientras la migración `20261009120000` no esté en el Supabase alojado, cualquier preview (que usa la base de datos de producción) solo puede mostrar el estado «no disponible». Las capturas no se pueden regenerar en local (Kong no se descarga); las genera la CI como artefacto.
- OpenSEO multiempresa fase 5 (rama `claude/openseo-fase5-negativas`, apilada sobre #33): matriz negativa pgTAP 25/25 en local e integración de la Data API (en CI). Un primer borrador daba falsos positivos: la fila de prueba violaba otra restricción con el mismo código `23514`. Se corrigió y ahora se comprueba el mensaje exacto, con un control positivo. Sin cambios de producto ni alojados.
- OpenSEO multiempresa fase 4 (rama `claude/openseo-fase4-cableado`, apilada sobre #32): con `OPENSEO_PROJECT_CONNECTIONS_MODE=project`, probar, lanzar y consultar usan solo la conexión del proyecto, y cada job queda ligado a su conexión. La variable no está definida en Vercel, así que producción sigue en `legacy`. Local: pgTAP de todas las suites sin fallos (fase 4: 14/14), `npm run verify` 226/226, tipos idénticos. CI en el PR. Sin cambios alojados.
- OpenSEO multiempresa fase 1 ([ADR 0007](adr/0007-openseo-conexion-por-proyecto.md)): migración, RPC y módulo de conexión por proyecto en rama, sin cablear. pgTAP local 32/32; la integración Data API solo en CI. No se aplica en alojado ni se lanza ninguna auditoría.
- Estado más reciente: redeploy de activación `READY` (`dpl_6hzwqBBTJq4582stffdxcU8VmdGF`, SHA `afb5a38`) con alias público. Migraciones y configuración completadas; pendiente escritura/recarga real y aislamiento alojado. Los pendientes de estado del redeploy de la entrada siguiente quedan resueltos por esta comprobación.
- Actualización posterior: el propietario aplicó las tres migraciones pendientes al Supabase Rubik `yvdgmklgwlshizzgefpv`; la lista CLI confirma las cinco versiones sincronizadas. INFO del ledger privado sin políticas corresponde al diseño RPC, no se añaden políticas abiertas. WARN de contraseñas filtradas permanece. Se creó `OPENSEO_PROJECT_JOBS_ENABLED=true` solo en producción y se solicitó redeploy `dpl_6hzwqBBTJq4582stffdxcU8VmdGF` del mismo SHA probado; falta confirmar estado final y guardado real. Esta evidencia reemplaza los pendientes de migraciones/configuración de los hitos siguientes.
- Checkpoint actual (09/10/2026, 10:09 Europe/Madrid): PR #28/#29/#30 integrados; el último merge `afb5a3838981a78b9f126acc280fdc0138bfdae0` está en producción Vercel `READY`, deployment `dpl_EnV1hDHWJUJkaS4rJm8NvTaDPKDf`. CI del HEAD de PR #30 `c7cadda` completa en verde ([37902474922](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37902474922)).
- Jobs y guardado: reserva atómica antes de MCP, un trabajo activo por proyecto, consulta vinculada al auditId propio, finalización transaccional de incidencias/páginas firmadas e historial verificado. Pruebas locales de aplicación 210/210; CI incluye SQL/tipos, ocho sesiones concurrentes y escritura/lectura firmada sin duplicados. **Código desplegado, guardado alojado desactivado:** no se ha aplicado ni comprobado la migración alojada de jobs desde esta conexión.
- Titularidad: PR #29 integrado; página `/aviso-titularidad` comprobada públicamente con HTTP 200 y el aviso solicitado. No implementa un sistema comercial de licencias.
- Los puntos siguientes conservan los hitos previos; sus límites de implementación quedan reemplazados por este checkpoint, sin convertir pruebas locales en evidencia alojada.
- PR #14: selección de la auditoría recién iniciada, rechazo de UUID concatenados antes de llamar a OpenSEO, variante www/apex solo con allowlist explícita y contadores separados de exclusión. Revisión independiente y 148 tests locales. CI Node22/24 y e2e Supabase pasan ([run 37855323689](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37855323689)); integrado en main como `c2789b9e60e748eab9cee3ea832be740a4d1ff65`. Preview Vercel READY. Producción Vercel READY `dpl_7JMi11kCJotvpnFp3ShGpL5EEvAP`, alias público y SHA del merge comprobados.
- [PR #15](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/15), callback de confirmación: preparado soporte PKCE `code` y `sb_flow_id` además de `token_hash` de email/signup. 19 tests nuevos; suite total 167 tests, ESLint y TypeScript pasan. Prueba alojada de este flujo todavía pendiente.
- La prueba real anterior de OpenSEO terminó con 10/10 páginas. No se ha lanzado otra auditoría para verificar estos cambios.
- PR #19/#20: historial acotado y firma vinculada a UUID de cliente/proyecto, integrados y desplegados con CI completa; una firma genuina copiada entre proyectos queda `SCOPE_MISMATCH`.
- PR #21: frontera para reutilizar un `activeJob` y rechazar un `auditId` no vinculado antes de MCP. CI completa verde (`37864049883`) y producción READY en `35277d8` (`dpl_F82HEYtPYntCHAgMmq2pAzBjkJoK`). Esa frontera ya tiene repositorio y actions mediante PR #28/#30; su activación alojada sigue pendiente.

## Comprobaciones alojadas de solo lectura

- Vercel, 09/10/2026, autorizada por el propietario (solo nombres y destino, sin valores):
  - Producción tiene `OPENSEO_ENDPOINT`, `OPENSEO_API_KEY`, `OPENSEO_PROJECT_ID`, `OPENSEO_AUDIT_ALLOWED_HOSTS`, `OPENSEO_AUDIT_MAX_PAGES`, `OPENSEO_WHOAMI_IDENTITY_FIELD`, `OPENSEO_AUDIT_STATUS_COMPLETED`, `OPENSEO_AUDIT_STATUS_FAILED`, `OPENSEO_PROJECT_JOBS_ENABLED`, `PROVENANCE_SIGNING_KEYS`, `PROVENANCE_ACTIVE_KEY_ID` y las dos públicas de Supabase.
  - Preview solo tiene `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, en la misma entrada que producción: **las previews usan el Supabase de producción**.
  - `OPENSEO_AUDIT_STATUS_PENDING` no está definida.
  - Preview del PR #32: `/api/salud` responde 200 (`CORE-9.3`, `auth: supabase`). Se consultó mediante el acceso de Vercel; el bloqueo de acceso directo para terceros no se ha comprobado.
- Supabase: el propietario aplicó CORE-9.2/9.3/jobs con su CLI en `yvdgmklgwlshizzgefpv` y `migration list` muestra las cinco versiones sincronizadas (evidencia compartida el 09/10/2026). El conector de este entorno sigue sin listar ese proyecto: tablas, RLS y permisos alojados no se han inspeccionado desde aquí. No se escribe en Sarah Studio.
- Vercel: `PROVENANCE_SIGNING_KEYS` (Secret/sensitive, 32 bytes aleatorios) y `PROVENANCE_ACTIVE_KEY_ID` creados solo para producción y su metadata comprobada el 09/10/2026. No se sustituyeron claves anteriores ni se publicaron sus valores. La existencia del keyring no certifica todavía su uso en una escritura alojada; el flag de jobs sigue apagado.
- Security Advisor: un aviso `auth_leaked_password_protection`; protección contra contraseñas filtradas desactivada. [Supabase documenta que requiere Pro o superior](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No se contrata ningún plan para resolverlo automáticamente.

## Dependencias y siguiente acción

| Tarea | Dependencia concreta | Trabajo que puede continuar |
|---|---|---|
| Persistencia firmada de OpenSEO | Migraciones aplicadas, HMAC y flag en producción, redeploy `READY`. Falta una auditoría nueva del propietario (créditos) para verificar escritura, recarga y reintento sin duplicados | Código, historial y transacción integrados y probados en CI. Procedimiento en [OPENSEO-ACTIVATION](OPENSEO-ACTIVATION.md); no recrear resultados desde el navegador |
| Aplicar migraciones alojadas | Mantener coherencia de versiones entre historial remoto y archivos del repo | Revisar SQL/privilegios y preparar `db push --dry-run` con CLI enlazado; no duplicar migraciones con timestamps distintos por una segunda vía |
| Un trabajo activo por proyecto | Ledger alojado aplicado y activado; pendiente de su primera reserva real | RPC y actions integrados; CI confirma una sola adquisición entre ocho sesiones. Pendiente reconciliación administrativa de STARTING incierto, sin caducarlo automáticamente |
| Varios clientes OpenSEO | `OPENSEO_PROJECT_ID` global; almacén de secretos sin decidir para claves por cliente | Fase 1 ([ADR 0007](adr/0007-openseo-conexion-por-proyecto.md)): conexión por proyecto con consentimiento, revocación y pgTAP, sin cablear. Run/follow siguen usando la configuración global; no declarar multicliente el puente |
| Enlaces de correo estándar | PKCE necesita el verificador del navegador de origen | Código y tests preparados. Validar registro alojado desde el mismo navegador; fragmentos `#access_token` no llegan al servidor |
| Plantilla personalizada de correo | Nuevos Free con SMTP predeterminado pueden no permitir editar plantillas desde junio de 2026 | Comprobar restricciones del proyecto antes de guiar al propietario. [Cambio del 03/06/2026](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier) y [plantillas](https://supabase.com/docs/guides/auth/auth-email-templates) |
| Search Console y Bing | OAuth y propiedad autorizada para la prueba real | Contratos de lectura y mocks; no simular consentimiento ni declarar una conexión live |
| Competidores, backlinks, ranking | API disponible, costes y presupuestos; histórico/scheduler para ranking | Fases en el backlog. No ampliar la allowlist de herramientas ni activar llamadas de pago |

## Límites de verificación local

Docker no existe en este workspace. El build local de Next/Turbopack falla por `uv_resident_set_memory` (`ENOENT`), aunque las pruebas pasan; los builds Node22/24 del PR #14 sí pasan en CI. El push por terminal no dispone de autenticación; la conexión GitHub sí permite crear ramas, commits y PR. Estos límites no impiden continuar el desarrollo y documentar cada entrega.

No hay una sesión de Claude Code accesible y confirmada. La revisión interna independiente no debe presentarse como trabajo de Claude. El lanzamiento/indexación y la publicación de contenidos de Sarah siguen fuera de estas entregas.

Contrato y límites de API OpenSEO comprobados por código/documentación: [OPENSEO-API-CAPABILITIES](OPENSEO-API-CAPABILITIES.md). Coste alojado y del proveedor deben presupuestarse antes de ampliar el puente.
