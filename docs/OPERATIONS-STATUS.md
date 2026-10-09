# Estado operativo comprobado — 09/10/2026

Este registro separa lo observado de lo pendiente; las autorizaciones del propietario para avanzar permanecen vigentes. No hay que volver a pedir permiso para preparar cambios de código, pruebas o PR dentro del alcance autorizado.

## Entrega actual

- Search Console y Bing, fase A ([ADR 0009](adr/0009-search-console-bing-lectura.md), rama `claude/gsc-bing-lectura` desde `main`): transportes de servidor de solo lectura probados a través del Core con simulaciones. Sin OAuth, claves ni propiedades reales. La documentación oficial se contrastó por búsqueda acotada porque la descarga directa está bloqueada en este entorno.
- PR #14: selección de la auditoría recién iniciada, rechazo de UUID concatenados antes de llamar a OpenSEO, variante www/apex solo con allowlist explícita y contadores separados de exclusión. Revisión independiente y 148 tests locales. CI Node22/24 y e2e Supabase pasan ([run 37855323689](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37855323689)); integrado en main como `c2789b9e60e748eab9cee3ea832be740a4d1ff65`. Preview Vercel READY. Producción Vercel READY `dpl_7JMi11kCJotvpnFp3ShGpL5EEvAP`, alias público y SHA del merge comprobados.
- [PR #15](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/15), callback de confirmación: preparado soporte PKCE `code` y `sb_flow_id` además de `token_hash` de email/signup. 19 tests nuevos; suite total 167 tests, ESLint y TypeScript pasan. Prueba alojada de este flujo todavía pendiente.
- La prueba real anterior de OpenSEO terminó con 10/10 páginas. No se ha lanzado otra auditoría para verificar estos cambios.
- PR #19/#20: historial acotado y firma vinculada a UUID de cliente/proyecto, integrados y desplegados con CI completa; una firma genuina copiada entre proyectos queda `SCOPE_MISMATCH`.
- PR #21: frontera para reutilizar un `activeJob` y rechazar un `auditId` no vinculado antes de MCP. CI completa verde (`37864049883`) y producción READY en `35277d8` (`dpl_F82HEYtPYntCHAgMmq2pAzBjkJoK`). Todavía no existe repositorio operativo de jobs ni persistencia OpenSEO.

## Comprobaciones alojadas de solo lectura

- Supabase: solo dos migraciones CORE-9.1; cuatro tablas públicas (organizaciones, proyectos y pertenencias), todas con RLS activo. CORE-9.2/9.3 todavía no aplicadas.
- Vercel: no figuran `PROVENANCE_SIGNING_KEYS` ni `PROVENANCE_ACTIVE_KEY_ID` en los metadatos de configuración. No se han leído ni publicado valores de secretos.
- Security Advisor: un aviso `auth_leaked_password_protection`; protección contra contraseñas filtradas desactivada. [Supabase documenta que requiere Pro o superior](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No se contrata ningún plan para resolverlo automáticamente.

## Dependencias y siguiente acción

| Tarea | Dependencia concreta | Trabajo que puede continuar |
|---|---|---|
| Persistencia firmada de OpenSEO | Migraciones CORE-9.2/9.3 y claves HMAC de servidor ausentes; capturar el resultado original firmado del Core | Implementar captura, historial, verificación y pruebas con mocks. Preparar activación alojada sin recrear resultados desde el navegador |
| Aplicar migraciones alojadas | Mantener coherencia de versiones entre historial remoto y archivos del repo | Revisar SQL/privilegios y preparar `db push --dry-run` con CLI enlazado; no duplicar migraciones con timestamps distintos por una segunda vía |
| Un trabajo activo por proyecto | Adquisición atómica e idempotencia en PostgreSQL | Preparar contrato y pruebas de carrera; bloquear botones solo evita duplicados dentro de esa consola |
| Varios clientes OpenSEO | `OPENSEO_PROJECT_ID` global | Enlace por proyecto bajo RLS, revocación, scope y prueba negativa entre clientes; no declarar multicliente el puente actual |
| Enlaces de correo estándar | PKCE necesita el verificador del navegador de origen | Código y tests preparados. Validar registro alojado desde el mismo navegador; fragmentos `#access_token` no llegan al servidor |
| Plantilla personalizada de correo | Nuevos Free con SMTP predeterminado pueden no permitir editar plantillas desde junio de 2026 | Comprobar restricciones del proyecto antes de guiar al propietario. [Cambio del 03/06/2026](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier) y [plantillas](https://supabase.com/docs/guides/auth/auth-email-templates) |
| Search Console y Bing | OAuth y propiedad autorizada para la prueba real | Contratos de lectura y mocks; no simular consentimiento ni declarar una conexión live |
| Competidores, backlinks, ranking | API disponible, costes y presupuestos; histórico/scheduler para ranking | Fases en el backlog. No ampliar la allowlist de herramientas ni activar llamadas de pago |

## Límites de verificación local

Docker no existe en este workspace. El build local de Next/Turbopack falla por `uv_resident_set_memory` (`ENOENT`), aunque las pruebas pasan; los builds Node22/24 del PR #14 sí pasan en CI. El push por terminal no dispone de autenticación; la conexión GitHub sí permite crear ramas, commits y PR. Estos límites no impiden continuar el desarrollo y documentar cada entrega.

No hay una sesión de Claude Code accesible y confirmada. La revisión interna independiente no debe presentarse como trabajo de Claude. El lanzamiento/indexación y la publicación de contenidos de Sarah siguen fuera de estas entregas.

Contrato y límites de API OpenSEO comprobados por código/documentación: [OPENSEO-API-CAPABILITIES](OPENSEO-API-CAPABILITIES.md). Coste alojado y del proveedor deben presupuestarse antes de ampliar el puente.
