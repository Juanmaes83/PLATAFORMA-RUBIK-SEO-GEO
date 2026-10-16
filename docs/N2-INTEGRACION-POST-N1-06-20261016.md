# Integración N2 sobre N1-06 · 16/10/2026

## Actualización: resolución de revisión Claude en #120 · 16/10/2026

La matriz completa está en [REVISION-INTEGRACION-N2-CLAUDE-RESOLUCION-20261016.md](REVISION-INTEGRACION-N2-CLAUDE-RESOLUCION-20261016.md). El informe fuente se leyó por su commit `8a48fa9969463e227c0c72389d09fe985c2aa9f1`, sin integrar su rama documental.

- Se corrigieron permisos de `updated_at`, eliminación de keywords y recibos S1; se añadió el fixture de rollback de contención. El borrado de keywords requiere `delete-data`; una prueba E2E valida que analyst no puede borrar y titular sí con confirmación.
- El allowlist outbox ahora conserva explícitamente acciones acumuladas S1 → SEO → Competidores. El helper dinámico anterior falló al serializar arrays y se eliminó; la migración canónica corregida pasa integración y pgTAP.
- Export v2 anterior y export actual con N2 disponible no se confunden. Con N2 deshabilitado el endpoint declara omisiones, no firma manifiesto y reporta `UNPROVEN`; los errores de lectura con N2 activo no producen fallback. No se presenta una exportación que omite datos N2 como completa.
- El restore no reasigna autoría al operador; preflight aborta si faltan cuentas de autores. R1 y la retención/anonimización legal siguen pendientes de decisión.
- Última validación local en stack exclusivo `rubik-n2-audit-20261016`: `npm run verify` 58/514 PASS; integración 20/121 PASS; pgTAP 26/734 PASS; Playwright 157 PASS / 50 SKIP / 0 FAIL de 207. Limpieza E2E: 11 usuarios/2 organizaciones propios, sin residuos.
- No se ejecutaron migraciones alojadas ni se consultaron Supabase alojado, Vercel Preview, proveedores o datos reales de Sarah. GitHub Actions sigue bloqueada antes de ejecutar pasos por facturación.
- Los interruptores adicionales y la futura v4 citados en el informe Claude son propuestas. No son decisiones aprobadas ni están implementadas aquí.

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
- E2E en el primer SHA combinado: **156 PASS, 50 SKIP, 1 FAIL de 207**. La aserción heredada esperaba `rubik-project-export-v2` y `rubik-export-manifest-v1`, mientras que la ruta integrada produce v3 y manifiesto v2 con SEO, tal como implementa `exportar/route.ts`. La prueba se actualizó al contrato nuevo.
- Repetición E2E sobre `f1ceb0e4fcf9e19cc6e78cd685d5b6b8fce58d88`: mismo recuento, con un fallo porque la prueba esperaba listas SEO vacías. Las pruebas de Competidores anteriores habían creado registros en el proyecto ficticio compartido por la suite; la exportación los incluyó correctamente. La aserción se ajustó para comprobar que las listas existen y que los recuentos firmados del manifiesto coinciden con su contenido, sin depender de que estén vacías. La limpieza informó 11 usuarios y 2 organizaciones propios, sin residuos. E2E completa queda pendiente de repetición tras este ajuste.

## Resultado final de verificación local · 16/10/2026 — SHA de código `b3596500f1d5cd867d2e006c05d2454677d7843c`

El propietario ejecutó todos los gates sobre la rama combinada local Windows, usando el stack identificado `rubik-n2-integration-20261016` y su configuración CLI en `test-results/n2-integration-stack`:

- `npm run verify`: **PASS**, 57 archivos / 512 pruebas; core pin, escaneo de secretos (506 archivos), lint, tipos y build PASS.
- `node scripts/verify-n2-integration.mjs`: **PASS**, 18/18 archivos / 119/119 pruebas.
- `npx --yes supabase@2.118.0 --workdir test-results/n2-integration-stack test db`: **PASS**, 25/25 archivos / 718/718 aserciones pgTAP.
- `node scripts/verify-n2-integration.mjs e2e --reporter=dot`: **PASS**, 157 PASS / 50 SKIP / 0 FAIL (207 casos, 4,5 min).
- E2E cleanup informó 11 usuarios y 2 organizaciones propios y ningún residuo.
- No se reportó reset del stack ni aplicación de migraciones en esta corrida. Los tests son locales; GitHub Actions sigue bloqueada por facturación y no ejecuta pasos.

Las dos mejoras añadidas después de la E2E anterior también están presentes en este SHA: aviso al alcanzar el límite de 500 keywords y revocación de grants de escritura por columna en el rollback SEO. El estado del PR #120 y esta evidencia se actualizaron desde el HEAD verificado.

## Estado de merge e integración posterior

#120 continúa OPEN/Draft, base `main@b6555eaa8190ed8668c501813fda01e06c75163c`. No fusionar #114 ni #115 por separado: #120 consolida su código. #119, #116 y #117 continúan como ramas/PR Draft separadas con base anterior y requieren rebase/revisión una vez cerrado #120. #118 es únicamente diseño/contrato de N2-14.

El merge a main queda **pendiente de resolver el comportamiento de despliegue**: las rutas SEO/Competidores consultan tablas N2 no aplicadas en Supabase alojado. No realizar migraciones alojadas, cambios de Production, secretos ni proveedores como parte de este PR. H1 sigue parcial y H2 bloqueado.

## Plan por responsables

1. **ChatGPT supervisor:** auditar el diff final de #120 y la estrategia de compatibilidad de despliegue; coordinar el merge por SHA solo cuando el código no exponga una aplicación incompatible con Production y el propietario mantenga su autorización.
2. **Codex/Claude:** mientras #120 siga abierta, solo auditoría, análisis de conflictos y diseño documental independiente; no abrir otra PR de producto ni alterar su worktree. Después, rebasar #119; luego #116/#117 con exportación y recuperación firmadas para sus tablas, manteniendo formato anterior y listas de auditoría aditivas.
3. **Claude, trabajo inmediato:** seguir el prompt de [HANDOFF-CLAUDE-INTEGRACION-N2-20261016.md](HANDOFF-CLAUDE-INTEGRACION-N2-20261016.md); entregar mapa de conflictos/dependencias, diseño fail-safe de despliegue y secuencia de integración sin cambios alojados.
4. **Propietario:** resolver U02/U03/U04 y R1/R3/R4/R7 cuando corresponda; cualquier operación alojada necesita ventana, entorno, respaldo y autorización operativa específica.

