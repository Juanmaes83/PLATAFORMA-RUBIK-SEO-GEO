# N2-09 · primer incremento SEO local · 15/10/2026

Base: `origin/main@d12b80ee4c229ab8c90f1044ecd0108165f8bb2e`. Rama independiente `codex/n2-09-seo-analysis-20261015`. PR #113 de recuperación permanece Draft en otro worktree. No se accedió a Sarah, Production, Preview ni proveedores facturables.

## Matriz de capacidades antes del cambio

| Capacidad | Estado previo y dato real | Brecha | Reutilización y entregable |
| --- | --- | --- | --- |
| Crawl técnico | Core fija `auditIssues` (URL, tipo, severidad) y `auditPages` (URL); plataforma firma por proyecto | Solo consola e historial, sin lectura de trabajo por categoría o página | `listProviderResults` + `loadProviderResult` verifican firma/ámbito; pantalla SEO filtra incidencias y conserva enlace original |
| On-Page | Core tiene contratos de publicación y metadatos para sitios bajo su control; OpenSEO persistido aquí solo da URL y tipo de incidencia | No hay HTML, valores title/H1/canonical/alt ni grafo de enlaces | Vista URL separa hallazgos observados, derivación, acción propuesta y campos «No evaluado» con dato requerido |
| Lighthouse | Importación `rubik-import-v1` con hallazgos, fecha y observación declarada | No podía verse al lado de la URL | Se muestra con fuente y enlace al fichero importado; nunca se presenta como resultado firmado |
| Keywords | Hay contrato Core de proveedor de pago, pero no lectura autorizada de volumen/SERP | Falta agenda manual por proyecto | Tabla `seo_keywords` con RLS, alta, edición de intención/tema/página y borrado; sin métricas inventadas |
| Priorización | Severidad normalizada ERROR/WARNING/OPPORTUNITY | Sin explicación orientada al trabajo | «Revisión alta/media/por valorar» según severidad; pide confirmar intención y contexto antes de corregir |

## Contratos y límites

- La página `/proyectos/{tenant}/{project}/seo` exige sesión y membresía. Las consultas usan el cliente del usuario y RLS. Los resultados OpenSEO solo se interpretan después de `loadProviderResult` con la firma y el ámbito esperados. La selección de páginas corresponde a la misma auditoría cuando hay ID de auditoría en los dos resultados.
- El primer resultado de incidencias del historial es el único mostrado. Si falla su verificación, la pantalla oculta sus datos y avisa; no vuelve a un resultado más antiguo que pudiera parecer actual. El historial mostrado tiene límite 100. Capturas parciales se advierten. Una lista vacía no se convierte en un aprobado SEO.
- El Core no conserva en `auditPages` el title, description, H1, canonical, alt, enlaces internos, contenido ni estados HTTP por URL. El tipo de una incidencia puede señalar una de esas áreas, pero no permite presentar el valor de la etiqueta. Todos esos valores aparecen «No evaluado» hasta una fuente válida. Robots/sitemap/CWV se tratan de la misma manera. No se creó un crawler ni se consultó ningún sitio.
- Los hallazgos Lighthouse son importaciones **declaradas**; sus observaciones y propuestas se leen del contrato existente. No se recalculan puntuaciones ni se presentan como Core Web Vitals verificados.
- Las keywords son **declaradas por usuario**. La intención empieza sin clasificar y es revisable. Idioma, país y tema son explícitos. Un posible solapamiento significa la misma consulta y mercado asociados a dos URL distintas. No implica canibalización confirmada. Sin página asignada, la consulta queda pendiente de investigación. Volumen, dificultad, CPC, rankings, tendencia y oportunidad comercial cuantificada no están disponibles.
- Los filtros de incidencias incluyen categoría, severidad y estado **en la captura**. `OPEN` no significa que el problema siga abierto hoy. La prioridad se limita a recomendar orden de revisión; no ejecuta cambios.
- El contrato de importaciones actual solo acepta hallazgos por URL y observación; una lista de keywords no encaja sin falsear esa semántica. Este incremento ofrece alta manual y no usa el importador de hallazgos para keywords. Una importación de lista exige contrato versionado y reglas de duplicados antes de añadirse.

## Persistencia y autorización

La migración `20261015220000_n2_seo_keywords.sql` crea una tabla por proyecto con FK compuesta `(project_id, organization_id)`, RLS, lectura para miembros y escritura para owner/account-manager/analyst. Viewer y usuario sin membresía no pueden escribir. Los grants limitan columnas de INSERT/UPDATE; proyecto, organización, autor, consulta y mercado no se reasignan por UPDATE. La aplicación además comprueba `draft` del Core y valida que una URL objetivo HTTPS coincida con el dominio actual del proyecto. La restricción única impide duplicar la misma declaración para consulta/mercado/URL, pero admite URL distintas para avisar de posible solapamiento. Ningún dato de keyword se firma como si viniera de un proveedor.

La migración está probada **solo** en el stack local `rubik-n2-seo-20261015`, puertos 59321/59322. Para un entorno alojado haría falta aprobar despliegue, verificar el proyecto y su backup, aplicar la migración antes de publicar la ruta, probar RLS con identidades controladas y preparar reversión. No se hizo ninguno de esos pasos alojados.

## Reproducción local

1. `node scripts/n2-seo-stack.mjs` prepara una copia del esquema y tests en `test-results/n2-seo-stack` (ignorada por Git). Verificar que los puertos 59321/59322 estén libres y que el ID de contenedor sea `rubik-n2-seo-20261015`.
2. `npx --yes supabase@2.118.0 --workdir test-results/n2-seo-stack start -x postgres-meta,imgproxy,vector,logflare,supavisor,studio,realtime,storage-api,edge-runtime` arranca **solo** ese stack. `db reset --local` para reaplicar desde cero destruye **solo** la base N2 desechable.
3. `npx --yes supabase@2.118.0 --workdir test-results/n2-seo-stack test db` ejecuta pgTAP, que crea identidades `.test` dentro de transacciones con rollback.
4. `node scripts/verify-n2-integration.mjs` habilita el escritor con una clave ficticia efímera en el contenedor N2 y ejecuta la suite de integración. `node scripts/verify-n2-integration.mjs e2e` hace lo mismo para Playwright; los fixtures E2E se limpian por identificador de ejecución. El script comprueba API, puerto y nombre del contenedor antes de modificar el rol local y no guarda la clave.
5. `npm run verify` cubre pin, secretos, lint, tipos, unitarias y build. Para capturas del SEO únicamente, ejecutar `UPDATE_VISUAL_EVIDENCE=1 node scripts/verify-n2-integration.mjs e2e e2e/visual.spec.ts e2e/seo.spec.ts --grep '26-seo|27-seo|N2 keyword'` (en PowerShell establecer la variable de entorno en una línea previa). Las capturas de `docs/visual/` usan cuentas y palabras clave ficticias.

## Evidencia local al cierre

- `npm run verify`: **484/484** unitarias, pin, secretos, lint, tipos y build correctos.
- Integración completa con escritor N2 efímero: **101/101**. Después se añadió un hallazgo OpenSEO realista al test de job y se repitió esa integración dirigida **2/2**; firma, reapertura y diagnóstico `missing-title` correctos.
- pgTAP en el stack N2: **661/661** en 24 ficheros, incluidos 20 nuevos asertos de `seo_keywords` con A1/A2/B1, analyst, viewer y persona sin membresía.
- Rollback SQL ensayado en una transacción local: después de `drop table` la tabla no existía y, tras `rollback`, volvió a existir (`t/t`). No se borró ningún fixture ajeno.
- Playwright completo con escritor local: **153 PASS / 48 SKIP / 0 FAIL** en 360, 390 y 1280 px. Tras añadir el filtro por estado se repitió el subconjunto visual y de mutación N2: **7 PASS / 2 SKIP / 0 FAIL**. El test visual comprueba overflow, controles, objetivos táctiles y violaciones graves/críticas de axe. Capturas ficticias: `docs/visual/{movil-360,movil-390,escritorio-1280}/26-seo-analista.png`, `27-seo-cliente.png` y `escritorio-1280/28-seo-keyword-ficticia.png`.
- Primeros intentos fallidos documentados: número de migración duplicado con S1, permiso de columna `updated_at` ausente, escritor local sin LOGIN y formulario de filtro sin acción explícita. Todos se corrigieron y sus gates afectados volvieron a pasar. GitHub Actions no se consideró evidencia: facturación sigue bloqueando la ejecución de jobs.

## Rollback y riesgos pendientes

- Antes de cualquier despliegue real, respaldar tabla y esquema y confirmar que ninguna keyword nueva necesita conservarse. Para retirar la ruta, revertir el commit de aplicación; para retirar la tabla en un entorno autorizado, exportar primero las declaraciones y aplicar [`20261015220000_n2_seo_keywords.sql`](../supabase/rollbacks/20261015220000_n2_seo_keywords.sql) en una ventana controlada. La migración es aditiva y no modifica tablas S1/S2.
- Tras una fusión de #113, reejecutar verify, integración, pgTAP y Playwright en una base nueva que incluya ambas ramas. `scripts/test-stacks.mjs` y el arreglo de CRLF en `claude-s1-stack.mjs` podrían producir un conflicto de Git pequeño; no se tocaron recuperación, exportación, outbox ni sus fixtures.
- La exportación/restauración de proyecto vigente no incluye todavía `seo_keywords`. Esta PR no modifica esos módulos porque #113 los está cambiando. **Bloquea desplegar N2 alojado con datos de clientes** hasta ampliar y probar un formato versionado de backup/restore de declaraciones keyword después de integrar #113, o establecer una copia independiente y verificable aprobada por el propietario. El piloto local usa solo datos desechables.
- No hay evaluación de metadatos reales ni métricas de mercado. Para ampliar On-Page hace falta una fuente autorizada con contrato explícito por URL y procedencia; para volumen/ranking, autorización de proveedor y presupuesto. El propietario debe elegir fuentes y prioridades comerciales. H1/H2 siguen abiertos por los gates alojados N1, independientemente de esta funcionalidad N2.

## Handoff

Comprobar primero `git status -sb`, `git rev-parse HEAD`, `git fetch origin`, `gh pr view 113` y el estado de la PR N2. Leer este documento y la descripción de PR. No usar los stacks compartido/S1/S2/N1 para N2. Continuación de mayor valor: conectar una fuente On-Page aprobada que aporte valores por URL con contrato versionado y pruebas de integridad; mientras no exista, mantener «No evaluado». No fusionar, migrar alojado ni desbloquear Preview sin autorización.
