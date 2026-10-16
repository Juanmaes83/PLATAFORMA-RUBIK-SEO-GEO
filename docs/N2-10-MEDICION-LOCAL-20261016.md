# N2-10 · Centro de medición orgánica (incremento local)

**Fecha:** 16/10/2026 · **Rama:** `codex/n2-10-medicion-conectores-20261016` · **Base:** `origin/main@d12b80ee4c229ab8c90f1044ecd0108165f8bb2e`.

## Entrega

Se añade `/proyectos/{tenantId}/{projectId}/medicion`, accesible desde la navegación del proyecto y desde el resumen. La pantalla recoge el historial existente de Search Console y GA4, muestra los datos únicamente después de `loadProviderResult` verifica la firma con el keyring de servidor y el alcance exacto del proyecto, y enlaza a las pantallas ya existentes de detalle, captura e historial. La comparación sigue usando `compareGoogleCaptures` en su pantalla actual.

Las métricas se muestran al nivel de fila firmado, sin sumar posiciones medias ni calcular totales de GA4 sobre dimensiones de página. Solo aparecen claves numéricas finitas que están realmente en cada fila. Periodo, propiedad, origen, fecha, cobertura `OK/PARTIAL/EMPTY` y firma se muestran por captura. Una captura `PARTIAL` se identifica y no se extrapola; `EMPTY` y métricas ausentes no se convierten en cero. Las filas de capturas con firma no válida quedan ocultas.

La pantalla separa la propiedad declarada, el vínculo de proyecto declarado, las capturas ejecutadas y los datos verificados. Un vínculo activo no se etiqueta como cuenta conectada ni demuestra que el proveedor responda. Bing muestra la asociación declarada, si es visible al rol y que la credencial/consulta autorizada falta; no llama al transporte. Abrir la página no ejecuta proveedores ni modifica datos.

La ruta requiere sesión y pertenencia actual al proyecto antes de leer. Todas las lecturas usan el cliente Supabase de la sesión y las consultas de resultados se filtran por organización y proyecto; no hay `service_role` ni cambios de esquema. Los errores de rol no se convierten en «sin propiedad». Se añadieron estados de carga y error, enlace con foco visible, layout adaptativo y checks Axe/overflow.

## Archivos

- `src/app/proyectos/[tenantId]/[projectId]/medicion/page.tsx`: centro agregado de fuentes y capturas firmadas.
- `src/app/proyectos/[tenantId]/[projectId]/medicion/loading.tsx` y `error.tsx`: estados de carga y fallo.
- `src/lib/medicion/resumen.ts`: representación conservadora de métricas por fila y estados.
- `src/components/ProjectNav.tsx`, `src/app/proyectos/[tenantId]/[projectId]/page.tsx` y `src/app/globals.css`: navegación y presentación adaptativa.
- `tests/measurement-summary.test.ts`, `e2e/measurement.spec.ts`: cobertura nueva.
- `docs/visual/{movil-360,movil-390,escritorio-1280}/30-centro-medicion.png`: capturas Playwright de fixtures ficticios.

## Evidencia local

Stack temporal exclusivo `rubik-n2-measurement-20261016`, con Supabase local en `127.0.0.1:61321` y PostgreSQL en `127.0.0.1:61322`. Se comprobó disponibilidad antes del arranque; las migraciones se aplicaron únicamente a esa base desechable. No se usaron los stacks en 54321, 55321, 56321, 58321, 59321 ni el stack ajeno observado en 60321. El escritor S1 del stack propio recibió una contraseña aleatoria efímera en memoria para integración; no se guardó en el repo ni en variables Vercel. Finalizadas las pruebas, se paró explícitamente ese `project_id` con `--no-backup` y se restauraron `supabase/config.toml` y `scripts/test-stacks.mjs` a sus valores de `main`.

En el HEAD de código de esta entrega se ejecutaron:

- Pruebas dirigidas nuevas + Google capture y comparison: **17/17**.
- `npm run test:integration`: **101/101**, 15 archivos; RLS, dos organizaciones/proyectos, firmas, importaciones, captura Google simulada y revocación.
- `npm run test:db`: **641/641 pgTAP**, 23 archivos, incluido aislamiento/RLS y contratos Google.
- `npm run test:e2e -- e2e/measurement.spec.ts`: **4 passed / 2 skipped / 0 failed**, en 360, 390 y 1280 px. Los skips son el test de rol en móvil; se verificaron axe (sin incidencias serias/críticas), overflow horizontal y cero llamadas a Google/Bing/OpenSEO. La limpieza informó **5 usuarios ficticios y 2 organizaciones propios, cero residuos**.
- `npm run typecheck`: PASS; `npm run lint` dirigido: PASS; `npm run build`: PASS y enumeró la nueva ruta dinámica. Repetidos sobre la versión final de la interfaz.
- `npm run verify`: Core pin y escaneo de secretos PASS (455 archivos). ESLint y TypeScript PASS; Vitest completó **480/482** con dos fallos en `tests/claude-s1-stack.test.ts` (`moves every published port...` y `uses ports no other registered stack uses`). La suite independiente ya confirmó esos fallos sin modificar ese script/stack, que se comparte con S1/Claude. Con el mismo archivo excluido, Vitest quedó **479/479**. `verify` se detuvo en Vitest, por lo que el build se ejecutó por separado y pasó.

Todo lo anterior es evidencia de código y datos ficticios en local. Actions no se considera verde: sigue bloqueada por facturación. No se probaron sesiones ni datos Supabase alojados, ni cuentas reales.

## Límites y decisiones pendientes

- No se ejecutaron nuevas lecturas GSC/GA4/Bing reales. El entorno local empieza sin capturas reales; los datos de Sarah documentados en otras notas no se cargaron ni usaron.
- OAuth/credenciales propias, consentimiento comercial, scopes, cuotas y presupuesto de Google/Bing requieren decisión del propietario. No hay almacén de secretos ni consultas externas nuevas.
- La lista de historial está limitada a las 25 capturas Google más recientes; la comparación conserva el selector existente y sus bloqueos/avisos.
- No se probó esta UI contra una captura real verificada. La verificación reutiliza el repositorio/protocolo de firma existente; las métricas sí se probaron con fixtures unitarios.
- El npm install de dependencias informó 5 advisories high; no se aplicó `npm audit fix` ni se cambiaron versiones.

## Reversión

Revertir el commit de N2-10. No hay migración que revertir. El stack `rubik-n2-measurement-20261016` es independiente y desechable; detener solo ese `project_id` cuando se cierre la revisión. No detener los stacks de otros agentes.

La rama parte de `d12b80ee4c229ab8c90f1044ecd0108165f8bb2e`. El commit funcional probado es `03fa66e` (`feat: add project organic measurement center`); el HEAD final incorporará este checkpoint documental. La continuación exacta y dependencias PR se documentan en [HANDOFF-N2-10-20261016.md](HANDOFF-N2-10-20261016.md).
