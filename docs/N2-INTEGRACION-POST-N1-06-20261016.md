# Integración N2 sobre N1-06 · 16/10/2026

## Estado del corte

- Rama local: `codex/n2-integration-post113-20261016`, basada en `main` después de #113 (`b6555eaa8190ed8668c501813fda01e06c75163c`).
- Incluye las ramas de #114 (N2-09 SEO) y #115 (N2-11 competidores), más el commit de recuperación SEO v3 `365b0c2` trasladado como cambio normal sobre el `main` actual. No incorpora el historial viejo de integración, que contenía una copia mergeada del antiguo #113.
- No se aplicó ninguna migración alojada ni se consultaron proveedores. No se usaron datos reales.

## Evidencia de esta integración

- `npm run verify`: PASS, 511/511 unitarias; comprobación de pin, secretos, lint, TypeScript y build PASS. Advertencia ESLint: variable `_manifest` sin uso en una prueba de recuperación.
- Reproducción de N2-10 sobre `main@b6555ea`: `npm run verify` PASS, 486/486 unitarias. Los dos fallos de puertos comunicados para el SHA de #119 no se reprodujeron en este entorno.
- `git diff --check`: PASS después de eliminar un espacio en blanco final heredado en `src/lib/competitors/domain.ts`.
- La batería de integración no se completó. Docker y Podman no están instalados en este entorno; el arranque de Supabase local falló con `DockerLifecycleInspectError` antes de crear un stack. `npm run test:integration` se interrumpió al mostrar archivos con cero pruebas recopiladas por falta de API local; no cuenta como PASS ni como fallo funcional de la suite.
- pgTAP y Playwright combinados: pendientes de ejecutar en un stack local desechable exclusivo.
- GitHub Actions continúa bloqueada por facturación; no hay CI verde para esta integración.

## Corrección del destino de integración local · 16/10/2026

- En el checkout limpio `e3257613194fd5fd5053a96ee6b173299db441be`, el propietario ejecutó el runner y obtuvo 16 archivos aprobados, 2 fallidos, 107 pruebas aprobadas, 9 fallidas y 3 omitidas. Los fallos fueron en Competidores y recuperación v3; PostgREST devolvió `PGRST205` porque el stack SEO de `59321` no tenía las tablas `competitors` ni `competitor_observations`.
- La consulta SQL local de solo lectura confirmó que `rubik-n2-integration-20261016` (`60321/60322`) sí tiene `seo_keywords`, `competitors` y `competitor_observations`; `rubik-n2-seo-20261015` (`59321/59322`) solo tiene `seo_keywords`. No se aplicaron migraciones ni se reseteó ninguno de los stacks.
- El verificador se corrigió para seleccionar el stack combinado exacto, comprobar URL API, puerto DB, nombre del contenedor y presencia de las tres tablas antes de modificar el rol local o iniciar pruebas. Si el esquema no coincide, aborta con un error explícito. `scripts/n2-integration-stack.mjs` solo genera una configuración CLI ignorada bajo `test-results/`; no inicia, detiene ni resetea contenedores.
- `npm run verify` tras esta corrección: **512/512 unitarias**, lint, tipos, secreto/core pin y build PASS; `git diff --check` PASS. En este runtime no estaba disponible Docker; por eso se pidió ejecutar las suites restantes en el equipo propietario.
- En el SHA `52e9c37580edc9df7bd47ecbc9d9bfa2c871c850`, el propietario ejecutó la integración en Windows contra el stack combinado: **18/18 archivos, 119/119 pruebas PASS**. pgTAP también pasó: **25 archivos, 718/718 pruebas PASS**. La salida muestra que los fixtures propios se limpiaron; no se ejecutó reset ni migración.
- E2E en el mismo SHA: **156 PASS, 50 SKIP, 1 FAIL de 207**. El único fallo está en `e2e/imports.spec.ts`: la aserción heredada esperaba `rubik-project-export-v2` y `rubik-export-manifest-v1`, mientras que la ruta integrada produce v3 y manifiesto v2 con el SEO del proyecto, tal como implementa `exportar/route.ts`. El test se actualizó para validar el formato y el manifiesto v3; hace falta repetir E2E después de publicar esa corrección. El runner informó limpieza de 11 usuarios y 2 organizaciones propios, sin residuos.

## Gaps que bloquean el merge

1. Repetir E2E en el SHA con la aserción actualizada para formato de exportación v3; integración (119/119) y pgTAP (718/718) ya están acreditados localmente en el stack combinado `rubik-n2-integration-20261016`. No resetear ni migrar un stack existente para resolver discrepancias.
2. Cerrar la revisión del contrato de recuperación v3 y compatibilidad con archivos v1/v2, incluyendo lecturas operativas parciales, integridad de firmas, restauración idempotente y restricción al mismo proyecto.
3. Confirmar una vez más que los contadores de acciones de auditoría de #114/#115 no se sobrescriben según el orden de migración.
4. Reconciliar navegación y `database.types.ts` regenerando tipos contra el esquema completo combinado si la batería lo requiere.

El estado alojado de H1/H2, las migraciones de producción y el piloto Sarah permanecen sin acreditar. El despliegue Vercel de #113 no valida esta rama ni sus migraciones.
