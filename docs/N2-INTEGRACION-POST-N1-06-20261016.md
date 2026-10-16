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

## Gaps que bloquean el merge

1. Ejecutar desde cero todas las migraciones en Supabase local desechable y completar integración, pgTAP, E2E y verificación de exportación/restauración sobre el mismo SHA combinado.
2. Revisar el contrato de recuperación v3 con manifests v1/v2, lecturas operativas parciales, integridad de firmas, restauración idempotente y restricción al mismo proyecto.
3. Confirmar una vez más que los contadores de acciones de auditoría de #114/#115 no se sobrescriben según el orden de migración.
4. Reconciliar navegación y `database.types.ts` regenerando tipos contra el esquema completo combinado si la batería lo requiere.

El estado alojado de H1/H2, las migraciones de producción y el piloto Sarah permanecen sin acreditar. El despliegue Vercel de #113 no valida esta rama ni sus migraciones.
