# Estado operativo comprobado — 09/10/2026

Este registro separa lo observado de lo pendiente; las autorizaciones del propietario para avanzar permanecen vigentes. No hay que volver a pedir permiso para preparar cambios de código, pruebas o PR dentro del alcance autorizado.

## Entrega actual

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

- Supabase: la comprobación alojada anterior registró dos migraciones CORE-9.1 y cuatro tablas públicas con RLS. No hay evidencia posterior de aplicación de CORE-9.2/9.3/jobs. El conector actual lista cinco proyectos, pero no el de Rubik; el propietario comunica login CLI en su terminal. No se presupone que eso cambie el acceso del conector ni se escribe en Sarah Studio.
- Vercel: `PROVENANCE_SIGNING_KEYS` (Secret/sensitive, 32 bytes aleatorios) y `PROVENANCE_ACTIVE_KEY_ID` creados solo para producción y su metadata comprobada el 09/10/2026. No se sustituyeron claves anteriores ni se publicaron sus valores. La existencia del keyring no certifica todavía su uso en una escritura alojada; el flag de jobs sigue apagado.
- Security Advisor: un aviso `auth_leaked_password_protection`; protección contra contraseñas filtradas desactivada. [Supabase documenta que requiere Pro o superior](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No se contrata ningún plan para resolverlo automáticamente.

## Dependencias y siguiente acción

| Tarea | Dependencia concreta | Trabajo que puede continuar |
|---|---|---|
| Persistencia firmada de OpenSEO | Comprobar/aplicar migraciones CORE-9.2/9.3/jobs al destino correcto y verificar firma/escritura alojada; HMAC ya configurado en Vercel | Código, historial y transacción integrados y probados en CI. Procedimiento en [OPENSEO-ACTIVATION](OPENSEO-ACTIVATION.md); no recrear resultados desde el navegador |
| Aplicar migraciones alojadas | Mantener coherencia de versiones entre historial remoto y archivos del repo | Revisar SQL/privilegios y preparar `db push --dry-run` con CLI enlazado; no duplicar migraciones con timestamps distintos por una segunda vía |
| Un trabajo activo por proyecto | Activar el ledger alojado después de las migraciones comprobadas | RPC y actions integrados; CI confirma una sola adquisición entre ocho sesiones. Pendiente reconciliación administrativa de STARTING incierto, sin caducarlo automáticamente |
| Varios clientes OpenSEO | `OPENSEO_PROJECT_ID` global | Enlace por proyecto bajo RLS, revocación, scope y prueba negativa entre clientes; no declarar multicliente el puente actual |
| Enlaces de correo estándar | PKCE necesita el verificador del navegador de origen | Código y tests preparados. Validar registro alojado desde el mismo navegador; fragmentos `#access_token` no llegan al servidor |
| Plantilla personalizada de correo | Nuevos Free con SMTP predeterminado pueden no permitir editar plantillas desde junio de 2026 | Comprobar restricciones del proyecto antes de guiar al propietario. [Cambio del 03/06/2026](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier) y [plantillas](https://supabase.com/docs/guides/auth/auth-email-templates) |
| Search Console y Bing | OAuth y propiedad autorizada para la prueba real | Contratos de lectura y mocks; no simular consentimiento ni declarar una conexión live |
| Competidores, backlinks, ranking | API disponible, costes y presupuestos; histórico/scheduler para ranking | Fases en el backlog. No ampliar la allowlist de herramientas ni activar llamadas de pago |

## Límites de verificación local

Docker no existe en este workspace. El build local de Next/Turbopack falla por `uv_resident_set_memory` (`ENOENT`), aunque las pruebas pasan; los builds Node22/24 del PR #14 sí pasan en CI. El push por terminal no dispone de autenticación; la conexión GitHub sí permite crear ramas, commits y PR. Estos límites no impiden continuar el desarrollo y documentar cada entrega.

No hay una sesión de Claude Code accesible y confirmada. La revisión interna independiente no debe presentarse como trabajo de Claude. El lanzamiento/indexación y la publicación de contenidos de Sarah siguen fuera de estas entregas.

Contrato y límites de API OpenSEO comprobados por código/documentación: [OPENSEO-API-CAPABILITIES](OPENSEO-API-CAPABILITIES.md). Coste alojado y del proveedor deben presupuestarse antes de ampliar el puente.
