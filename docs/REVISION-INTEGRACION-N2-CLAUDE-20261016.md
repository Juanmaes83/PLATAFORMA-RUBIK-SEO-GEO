# Revisión técnica y de seguridad · Integración N2 (PR #120 y dependientes)

**Autor:** Claude Code (revisor independiente) · **Fecha de consulta GitHub:** 16/10/2026 09:37 UTC (11:37 CEST)
**Worktree:** `/home/user/rubik-review-n2`, rama local `claude/review-n2-integration-20261016` creada desde
`9a43bfe8a76781dd799757e2da0101ebef8eef4a` (HEAD de #120). Sin push, sin comentarios en GitHub, sin cambios de estado de PR.

Leyenda de evidencia, usada en todo el documento:
- **[código]** comprobado leyendo el código del SHA indicado;
- **[observado]** ejecutado por mí en esta sesión, en mi stack local desechable `rubik-claude-s1-20261015`
  (127.0.0.1:57321/57322, contenedor de sesión propio; el stack de Codex `rubik-n2-integration-20261016` 60321/60322 no se tocó);
- **[comunicado]** prueba local informada por el propietario/Codex, no repetida por mí;
- **[pendiente alojado]** sin evidencia en Supabase alojado, Vercel ni GitHub Actions.

---

## 1. Resumen ejecutivo

**Qué puede integrarse ya:** nada debe fusionarse en `main` hoy. #120 integra correctamente el código de #114 y #115.
Su esquema se aplica limpio desde base vacía y pasa pgTAP 718/718 [observado]. Pero tiene un **bloqueante de merge pequeño y objetivo**:
`database.types.ts` no supera el paso de CI que compara tipos y migraciones [observado]. Tiene además un **bloqueante de despliegue**:
`/exportar` pasa a exigir tres tablas nuevas, y en un entorno sin las migraciones N2 devolvería 503 a **todos** los proyectos,
también a los que no usan SEO [código]. Eso degrada N1-06 (recuperación), ya fusionado.

**Qué lo bloquea:**
1. la cabecera de tipos, una corrección de una línea;
2. la ausencia de una barrera *fail-closed* por capacidad de esquema, que evite activar rutas, navegación y exportación v3 donde no existan las tablas;
3. la decisión del propietario sobre si `main` despliega automáticamente a Production [no comprobado].

**Riesgo más importante:** la **completitud silenciosa de la exportación** en los siguientes merges. La exportación v3 está cableada
a tres tablas (`src/lib/recovery/seo-state.ts`), y `NOT_INCLUDED` (`src/lib/recovery/operations.ts:43`) no menciona módulos.
Si #116 (N2-12) o #117 (N2-13) se fusionaran tal como están, el manifiesto firmado diría `COMPLETE` y omitiría
`content_*` y `geo_*` [código]. Falta un test de completitud derivado del esquema que lo impida.

Orden recomendado: corregir #120 (lote 0), mergear #120 con la barrera de capacidad, luego #119, y después #116 y #117 juntos con la exportación v4. Por último, #118 funcional.
**No fusionar #114 ni #115 por separado.**

---

## 2. Estado GitHub verificado (16/10/2026 09:37 UTC)

| PR | Estado | HEAD | Base | Notas verificadas |
|---|---|---|---|---|
| #113 N1-06 | MERGED 08:07:07Z | `55074b2` | — | `main` = `b6555eaa8190ed8668c501813fda01e06c75163c` |
| #114 N2-09 | OPEN Draft | `e68fbd4` | `d12b80e` | Absorbida por #120 (ver §3.0) |
| #115 N2-11 | OPEN Draft | `52ce3a1` | `d12b80e` | Absorbida por #120 |
| #116 N2-12 | OPEN Draft | `f394cdb` | `d12b80e` | 47 archivos; migración `20261016130000` |
| #117 N2-13 | OPEN Draft | `852b1b3` | `d12b80e` | 43 archivos; migración `20261016160000` |
| #118 N2-14 | OPEN Draft | `eb25bfe` | `d12b80e` | 4 archivos; diseño/contrato, sin ruta |
| #119 N2-10 | OPEN Draft | `476c534` | `d12b80e` | 14 archivos; sin migraciones; revisión del propietario 07:42Z «NO lista para merge directo» |
| #120 integración | OPEN Draft | `9a43bfe` | `b6555ea` | 74 archivos, 6 commits; sin revisiones; actualizada 09:33Z |

- Checks de `9a43bfe`: `verify (node 22/24)` y `e2e` en estado **failure sin ejecutar pasos**. La anotación dice
  «The job was not started because your account is locked due to a billing issue» [observado vía API]. Vercel: «Deployment has completed».
  Ese despliegue **no** valida Preview, que sigue bloqueada por diseño (#88).
- `b3596500..9a43bfe` solo cambia 6 documentos (131+/16−) [observado]: la evidencia sobre `b359650` aplica al código de `9a43bfe`.
- Los documentos obligatorios existen en la rama de #120. `HANDOFF-CLAUDE-INTEGRACION-N2-20261016.md` y
  `N2-INTEGRACION-POST-N1-06-20261016.md` solo existen ahí, no en `main`.

---

## 3. Hallazgos sobre #120

### 3.0 Integración de #114/#115 — sin hallazgos bloqueantes

[código] Comparé archivo a archivo cada cambio de #114 y #115 contra `9a43bfe`. **No falta ningún archivo.** Las diferencias son de integración:
- `seo/page.tsx`: aviso de 500 keywords.
- `seo_keywords_rls.test.sql`: más casos.
- Navegación: añade «Competidores».
- `database.types.ts`: tipos combinados.
- `competitors/domain.ts`: quita un espacio final.
- Scripts de stack.

#120 añade además:
- la migración `20261016110000_n2_seo_keyword_target_guard.sql`;
- la exportación y recuperación v3 (`seo-state.ts`, `manifest.ts`, `verify-export.ts`, `restore/plan.ts`, `exportar/route.ts`);
- las pruebas `seo-recovery-v3.integration.test.ts`.

Las ramas #114 y #115 contienen exactamente lo integrado: **cerrarlas como sustituidas** tras el merge de #120, no fusionarlas.

### 3.1 Bloqueante para merge

**B-1 · `database.types.ts` rompe el gate de CI «Migrations match the committed database types».**
- Evidencia [observado]: apliqué las 25 migraciones de #120 en un stack limpio, generé los tipos y ejecuté el paso literal de
  `.github/workflows/ci.yml:149`. `tail -n +4 src/lib/supabase/database.types.ts | diff - /tmp/types.ts` da exit 1 con
  `0a1 > ` (falta una línea). El cuerpo es idéntico. La cabecera de #120 (`database.types.ts:1-3`) tiene 3 líneas sin la línea en blanco 4 que tiene `main`.
  La causa es que se generó con otro comando: «`--workdir test-results/n2-seo-stack`».
- Consecuencia: en cuanto Actions vuelva a ejecutarse, `main` quedaría en rojo. Además, la evidencia comunicada no incluyó este gate:
  `verify-n2-integration.mjs` no lo ejecuta.
- Cambio: restaurar la cabecera canónica de `main`, con 3 comentarios y una línea en blanco, y regenerar con
  `{ git show origin/main:src/lib/supabase/database.types.ts | head -3; npx --yes supabase@2.118.0 --workdir <stack> gen types typescript --local --schema public; } > src/lib/supabase/database.types.ts`.
- Aceptación: el paso de CI reproducido localmente da exit 0. Lo he hecho en el árbol de prueba #120+#116+#117 y da PASS [observado].
  Recomiendo añadir ese paso a `scripts/verify-n2-integration.mjs` o usar `node scripts/ci-local/run.mjs --job e2e`.

### 3.2 Bloqueante para despliegue/activación

**D-1 · La exportación del proyecto falla (503) para todos los proyectos si faltan las tablas N2.**
- Evidencia [código]: `exportar/route.ts`, tras `operationalStateComplete`, llama `readSeoRecoveryState()` dos veces, y cualquier error devuelve
  `503 "Export unavailable: SEO data could not be read completely"`. `readSeoRecoveryState` (`src/lib/recovery/seo-state.ts:17-60`)
  falla ante cualquier error de PostgREST. Ante tabla ausente, el error es `PGRST205`, según la evidencia comunicada en `N2-INTEGRACION-POST-N1-06-20261016.md`.
- Consecuencia: con el esquema alojado actual (sin N2, [pendiente alojado]), un despliegue del código de `main` pierde la exportación firmada N1-06.
  Es la base de la recuperación de Sarah (U04). Es una regresión de una capacidad ya fusionada, no de una nueva.
- Cambio: barrera de capacidad (ver §7). Con la capacidad N2 desactivada, la ruta debe producir **exactamente el v2 de `main`**, sin intentar leer las tablas.
  Con la capacidad activada y la tabla ausente, debe dar 503 explícito y diagnóstico en `/api/salud`.
- Aceptación: prueba de integración con capacidad desactivada que obtiene `rubik-project-export-v2` / manifiesto v1 idéntico al de `main`.
  Prueba con capacidad activada que obtiene v3. Prueba unitaria de la ruta con un cliente simulado que devuelve `PGRST205` y espera 503,
  sin firma y sin cuerpo parcial.

**D-2 · Rutas y navegación SEO/Competidores activas sin comprobar el esquema.**
- Evidencia [código]:
  - `navigation.ts` marca `seo` y `competidores` como `available: true` sin condición.
  - `/seo` degrada parcialmente: muestra «No se pudieron leer las palabras clave» y el resto de la página funciona.
  - `/competidores` lanza una excepción en `listCompetitors` (`src/lib/competitors/repository.ts:80`), que termina en `error.tsx`.
  - Las acciones de guardar devuelven `error=guardar`.
- Consecuencia: no hay fuga de datos, porque las tablas no existen. Pero la navegación lleva a pantallas de error y a formularios que fallan.
  Es una mala experiencia en Production y genera ruido operativo.
- Cambio y aceptación: §7 (ocultar entradas y responder `Unavailable` con 200 o 404 honesto cuando la capacidad está desactivada).

**D-3 · Restauración v3 entre entornos aborta si falta cualquier autor SEO.**
- Evidencia [código]: `src/lib/restore/plan.ts` añade el check «un autor de datos SEO no existe» sobre `created_by` y `verified_by` de las tres tablas.
  Para `provider_results` e `imports`, en cambio, reasigna el autor ausente al operador (`update rubik_results … set created_by = op`).
- Consecuencia: restaurar un proyecto en una base nueva (recuperación ante desastre, U04), donde las cuentas no existen, falla en bloque.
  No restaura nada: falla de forma cerrada, sin pérdida de datos, pero la recuperación queda imposible.
  La prueba existente (`seo-recovery-v3.integration.test.ts:89`) solo restaura en la misma base, donde los autores existen.
- Cambio: decidir la política, y la decisión es del propietario (R1/R3). Hay dos opciones:
  - reasignar `created_by` al operador conservando el original en la exportación;
  - mantener el aborto pero documentarlo como limitación de U04.
  `verified_by` no debe reasignarse a ciegas, porque es una atribución humana: lo prudente es abortar o degradar la observación a `unverified` de forma explícita.
- Aceptación: prueba de integración que borra los usuarios autores antes de aplicar el plan y espera el comportamiento elegido.

### 3.3 Recomendable antes de merge

**R-1 · La lista de acciones de auditoría de N2-11 es fija.**
- Evidencia [código]: `20261016100000_n2_11_competitors.sql` hace `drop/add constraint audit_outbox_action_check` con una lista literal.
  [observado] En transacción revertida sobre el esquema de #120:
  - en orden de fecha, N2-11 seguida de N2-12 y N2-13 (que reconstruyen la lista de forma aditiva), conviven S1, `competitor.*`, `content.*` y `geo.*`;
  - si N2-11 se aplicara después de ellas, `content.*` y `geo.*` desaparecen (`B competitor=true content=false geo=false s1=true`).
- Consecuencia: hoy solo hay riesgo en una aplicación fuera de orden o en una futura migración con fecha anterior. Pero una lista fija es una trampa para cada módulo nuevo.
  Si hubiera recibos pendientes con acciones no listadas, el `ADD CONSTRAINT` fallaría.
- Cambio: sustituir el bloque de N2-11 por la reconstrucción aditiva de `#116`/`#117`, que lee `pg_get_constraintdef` y une las listas.
  Es barato ahora, porque #120 no está en `main`.
- Aceptación: aserción pgTAP de que, tras todas las migraciones, el check contiene las acciones S1 y las de cada módulo. Mi rama #117 tiene un ejemplo: `n2_13_geo_observations.test.sql`, aserción «S1 actions kept».

**R-2 · `seo_keywords` no tiene auditoría S1 y el borrado usa `draft`.**
- Evidencia:
  - [código] la migración `20261015220000` no tiene trigger de recibos;
  - [código] `src/lib/seo/actions.ts` no firma ni comprueba escritor ni claves, y `deleteKeywordAction` autoriza con `draft`;
  - [código] la política «drafting roles delete keywords» incluye `analyst`;
  - [observado] insertar una keyword deja 0 recibos;
  - [observado] en la captura `escritorio-1280/28-seo-keyword-ficticia.png`, «Eliminar» borra sin confirmación.
- Consecuencia: es inconsistente con Competidores, Importaciones y S1, donde cada cambio deja un recibo firmado y el borrado es `delete-data`, solo del titular.
  Un analista puede borrar declaraciones sin rastro.
- Cambio: trigger de recibos `seo.keyword.add|update|erase` con lista aditiva, borrado bajo `delete-data` y confirmación en la UI.
  Si el propietario acepta keywords sin auditoría, debe quedar documentado.
- Aceptación: pgTAP de un recibo por cambio con el rol vivo. Prueba de integración en la que un analista no borra y el titular borra con recibo firmado.

**R-3 · `seo_keywords.created_by references auth.users(id)` sin `ON DELETE`.**
- Evidencia [observado]: `delete from auth.users` de un autor de keywords falla con `seo_keywords_created_by_fkey`.
- Consecuencia: impide borrar o anonimizar una cuenta (RGPD) mientras existan sus keywords. Es incoherente con `competitors.created_by`, que no tiene FK.
- Cambio: retirar la FK, como en Competidores, o decidir explícitamente la política de retención (R3, del propietario).
- Aceptación: pgTAP de borrado de cuenta con keywords según la política.

**R-4 · El único rollback de `20261015220000` destruye datos.**
- Evidencia [código]: `supabase/rollbacks/20261015220000_n2_seo_keywords.sql` es `drop table public.seo_keywords`.
  El de `20261016110000` sí es de contención: revoca escrituras y no reabre la ruta insegura.
- Consecuencia: revertir N2-09 borra las declaraciones sin exigir exportación.
- Cambio: rollback de contención (revocar grants, quitar políticas, RLS activa sin políticas), como el de N2-11. El `drop` debe ir en un procedimiento separado con exportación previa.
- Aceptación: ensayo de rollback con datos y reaplicación, igual que hice para N2-12/N2-13. Resultado esperado: 0 grants, 0 políticas, RLS activa y filas intactas.
- Nota: **revertir** la migración `20261016110000` borrando el trigger, en vez de aplicar su rollback de contención, reabriría las escrituras Data API con `target_url` de otro host.
  Documentarlo junto al rollback.

**R-5 · Grant de `UPDATE (updated_at)` a `authenticated` en `seo_keywords`.** El cliente puede fijar cualquier marca de tiempo; no hay trigger que la imponga.
Conviene imponerla en un trigger `BEFORE UPDATE` y retirar el grant.

**R-6 · Capturas no regeneradas tras la integración.** [observado] He abierto `docs/visual/movil-360/26-seo-analista.png` y
`docs/visual/escritorio-1280/28-seo-keyword-ficticia.png`. La navegación no muestra «Competidores». Son capturas de #114, previas a la combinación.
Las de Competidores (30–34) proceden de #115 y no muestran «Análisis SEO».
No hay evidencia visual del HEAD combinado. Hay que regenerar con `npm run visual:evidence` sobre `9a43bfe`.

### 3.4 Sin hallazgos (comprobado)

- **Migraciones desde base limpia** [observado]: las 25 de #120 se aplican sin error, y pgTAP da 718/718 en `9a43bfe`. Coincide con lo comunicado.
- **Aislamiento y RLS de Competidores/SEO** [código + pgTAP observado]:
  - FKs compuestas `(project_id, organization_id)`;
  - `(competitor_id, project_id)`;
  - políticas por rol con `has_project_role`;
  - sin RPC nuevas expuestas;
  - guard de host en `target_url` con rechazo de *userinfo* y puerto inválido.
- **Exportación v3** [código]: manifiesto v2 firmado sobre `${version}:${canonicalJson}`, recuentos y digests por tabla, doble lectura para detectar cambios durante la lectura, y punto de control del outbox antes y después.
  Los formatos v1 y v2 siguen aceptándose (`verify-export.ts` `FORMATS`).
  Una v3 vacía solo se acepta con un manifiesto firmado que fije la identidad.
- **Restauración v3** [código + prueba comunicada]:
  - transacción única;
  - inserta solo lo ausente y aborta ante contenido distinto o dominio cambiado;
  - desactiva los triggers `BEFORE` solo dentro de la transacción offline;
  - es idempotente en la misma base (`seo-recovery-v3…:89`).
  Los triggers de auditoría `AFTER` no generan recibos en la restauración offline como `postgres` sin JWT (`queue_competitor_receipt`).
- **Cascadas**: borrar un proyecto arrastra keywords, competidores y observaciones. Los recibos pendientes lo bloquean (#106). Las cascadas no crean recibos huérfanos.

### 3.5 Huecos de prueba (cada uno con su prueba y ubicación)

| Hueco | Prueba concreta | Dónde |
|---|---|---|
| Paso de tipos de CI | Ejecutar el diff `tail -n +4` dentro del verificador | `scripts/verify-n2-integration.mjs` |
| Exportación sin tablas N2 / capacidad desactivada | Ruta con cliente simulado `PGRST205` → 503 sin cuerpo; capacidad desactivada → v2 idéntico a `main` | `tests/export-seo-capability.test.ts` (unitaria) + integración |
| **Completitud de exportación derivada del esquema** | Listar `information_schema.columns where column_name='project_id'` en `public`/`private` y exigir que cada tabla esté en la exportación o en `NOT_INCLUDED` con motivo | `tests/integration/export-completeness.integration.test.ts`; hoy detectaría además `provider_budgets`, `provider_spend`, `project_invitations` y `audit_idempotency` (preexistente, decisión R1/R3) |
| Restauración entre entornos | Borrar autores antes de aplicar el plan | `seo-recovery-v3.integration.test.ts` |
| Restauración de competidor archivado y observación verificada | Comprobar `status`, `archived_at`, `verified_by` y `verified_at` tras la restauración | mismo archivo |
| Lista aditiva de acciones | Aserción de que el check contiene S1 + `competitor.*` (+ módulos futuros) | `supabase/tests/n2_11_competitors.test.sql` |
| Keywords sin auditoría | Ver R-2 | pgTAP + integración |

---

## 4. Dependencias entre #120, #119, #116, #117 y #118

Fusiones de prueba en memoria (`git merge-tree`) y árboles de prueba locales no publicados [observado]:

| | #119 N2-10 | #116 N2-12 | #117 N2-13 | #118 N2-14 |
|---|---|---|---|---|
| **Objetivo / estado real** | Centro de medición orgánica de solo lectura sobre historial guardado; Draft; el propietario la marcó «NO lista» por 2 fallos de `claude-s1-stack.test.ts` en su entorno | Oportunidades, clústeres y briefs con revisión; Draft, funcional en local | Observaciones GEO declaradas/verificadas, oportunidades y propuestas; Draft, funcional en local | Solo diseño y contrato `src/lib/reports/contract.ts`; **no funcional** |
| **Tablas / migraciones** | Ninguna | `content_clusters`, `content_opportunities`, `content_evidence`, `content_briefs` (`20261016130000`, lista aditiva) | `geo_observations`, `geo_proposals` (`20261016160000`, lista aditiva) | Ninguna |
| **Exportación / recuperación** | No le afecta | **No cubiertas por v3** → exportación silenciosamente incompleta | **No cubiertas por v3** → ídem | Dependerá de todas |
| **Archivos compartidos y conflictos** | `globals.css` (hunk distinto), `ProjectNav.tsx` (entrada fija «Medición orgánica» fuera de `PROJECT_SECTIONS`), `page.tsx` del proyecto. Fusiona **sin conflictos** con #120 | Conflictos con #120 en `database.types.ts`, `docs/HANDOFF.md`, `docs/ROADMAP.md`; `navigation.ts` fusiona limpio; `globals.css` (regla `textarea` idéntica a #117) | Igual que #116; además `src/types/rubik-seo-geo-core.d.ts` (subpath `authority`) | Fusiona sin conflictos |
| **Pruebas comunicadas (SHA)** | Codex: verify 480/482 en `476c534` (2 fallos de puertos), 101/101 integración, 641/641 pgTAP, E2E 4/2/0 dirigida | Mías en `637be49`: verify 494, integración 110, pgTAP 717, E2E 149/46/0 | Mías en `65f1d48`: verify 494, integración 108, pgTAP 689, E2E 149/46/0 (tras repetir 1 intermitente ajeno) | 484/484 unitarias en `eb25bfe` |
| **Combinada con #120 [observado]** | Árbol `f6eee1f`: `tsc` OK, **515/515** unitarias | Árbol #120+#116+#117 con tipos regenerados: `tsc` OK, **542/542** unitarias, **pgTAP 842/842**, paso de tipos de CI PASS | (mismo árbol) | Fusiona limpio; no probada |
| **Pruebas que faltan combinadas** | Integración y E2E sobre #120; 404 real de proyecto ajeno en `/medicion` (`loading.tsx` de ruta: en esta versión de Next observé en N2-11 que convierte el 404 en 200; **inferencia** para #119) | Integración y E2E combinadas; test de completitud de exportación; exportación v4 | Ídem | — |
| **Condición mínima** | #120 en `main`; verify completo en el entorno del propietario; decidir entrada en `PROJECT_SECTIONS` vs `ProjectNav` fija; 404 honesto | #120 en `main` + **exportación/restauración v4** con `content_*` + capacidad por módulo | Ídem con `geo_*`; fusionar en el mismo lote que #116 (conflictos idénticos) | Fuentes en `main`; actualizar `SECTION_SOURCE` (keywords/competidores pasan a «en main» tras #120) |
| **Orden** | 2.º | 3.º (lote con #117) | 3.º (lote con #116) | 4.º |

Grafo (→ = «debe ir después de»):

```
main@b6555ea ──► #120 (absorbe #114, #115; cerrar éstas) ──► #119
                        │
                        ├──► [lote] #116 + #117 + export/restore v4 ──► #118 funcional
                        └── capacidad N2 (fail-closed) es prerrequisito de todo lo anterior en main
```

---

## 5. Secuencia de integración propuesta

0. **Lote 0, en #120 y antes del merge:**
   - B-1 (cabecera de tipos);
   - D-1/D-2 (barrera de capacidad, §7);
   - R-1 (lista aditiva en N2-11);
   - R-4 (rollback de contención);
   - recomendables R-2, R-3 y R-5, o aceptación documentada del propietario;
   - D-3 como decisión;
   - regenerar capturas (R-6).
   Repetir los gates de §6 sobre el SHA final.
1. **Merge de #120** por el propietario, sin migraciones alojadas. Con la capacidad desactivada por defecto, Production se comporta como `main`.
   Cerrar #114 y #115 como sustituidas, conservando sus ramas.
2. **#119:** rebasar sobre `main`. Es un cambio sin esquema y no tiene conflictos [observado].
   Resolver la entrada de navegación y el 404, y repetir verify completo en Windows para cerrar los 2 fallos de puertos que informó el propietario.
3. **#116 + #117 en un único lote:**
   - rebasar ambas;
   - resolver `docs/HANDOFF.md` y `docs/ROADMAP.md` conservando ambas líneas de relevo;
   - **regenerar** `database.types.ts` desde las migraciones combinadas con la cabecera canónica. No hay que elegir versión: ningún lado es correcto por separado. Lo comprobé: el tipo combinado pasa el paso de CI;
   - añadir la exportación v4 (`content_*`, `geo_*`) con manifiesto v3, aceptando v1, v2 y v3, y su restauración;
   - el test de completitud de §3.5;
   - capacidades `content` y `geo`.
4. **#118:** convertirla en un informe de solo lectura cuando sus fuentes estén en `main`, actualizando `SECTION_SOURCE`.

Resolución de archivos compartidos:

| Archivo | Ramas | Resolución segura | Validación |
|---|---|---|---|
| `src/lib/supabase/database.types.ts` | #120, #116, #117 | Regenerar desde todas las migraciones con la cabecera de `main` | Paso de CI `tail -n +4 \| diff` |
| `src/lib/navigation.ts` | #120, #116, #117 (#119 vía `ProjectNav`) | Unión de entradas; cada una condicionada por su capacidad | Unitaria de navegación + E2E de visibilidad |
| `src/app/globals.css` | #119, #116, #117 | Unión; la regla `textarea` es idéntica en #116 y #117 | Prueba visual de objetivos táctiles ≥44 px |
| `audit_outbox_action_check` | #120 (fija), #116/#117 (aditiva) | Todas aditivas (R-1) | pgTAP «S1 + módulos presentes» |
| `docs/HANDOFF.md`, `docs/ROADMAP.md` | todas | Conservar todos los bloques de relevo | Revisión manual |
| Formato de exportación | #120 (v3), futuro v4 | Versionado; verificador acepta todas las versiones anteriores | Prueba de cada fixture antiguo |

---

## 6. Gates locales combinados antes de cada merge (≠ CI ≠ validación alojada)

Ejecutar en un stack **exclusivo e identificado**, creado desde las migraciones del árbol a fusionar, sobre el SHA exacto:

| Gate | Comando | #120 | #119 | #116+#117 | #118 |
|---|---|---|---|---|---|
| Verify (pin, secretos, lint, tipos, unitarias, build) | `npm run verify` | ✔ | ✔ | ✔ | ✔ |
| Tipos = migraciones (paso CI) | `tail -n +4 src/lib/supabase/database.types.ts \| diff - <(supabase gen types …)` | ✔ (hoy falla) | ✔ | ✔ | — |
| pgTAP | `supabase --workdir <stack> test db` | ✔ | ✔ | ✔ | — |
| Integración | `node scripts/verify-n2-integration.mjs` | ✔ | ✔ | ✔ | — |
| E2E + accesibilidad 360/390/1280 | `node scripts/verify-n2-integration.mjs e2e` | ✔ | ✔ | ✔ | — |
| Exportación con capacidad desactivada = v2 de `main` | integración nueva (§3.5) | ✔ | — | ✔ | — |
| Completitud de exportación por esquema | integración nueva (§3.5) | ✔ | — | ✔ | — |
| Rollback de contención + reaplicación con datos | guion SQL en transacción | ✔ | — | ✔ | — |
| Capturas regeneradas e inspeccionadas | `npm run visual:evidence` | ✔ | ✔ | ✔ | — |

**CI de GitHub:** no disponible (facturación). Cuando vuelva, exigir verde en `verify (node 22/24)` y `e2e` del SHA exacto.
**Validación alojada:** fuera de esta tarea. Requiere ventana, respaldo y autorización U02/U03/U04 del propietario.

---

## 7. Plan *fail-closed* de despliegue (sin migraciones alojadas)

Alternativas comparadas:

| Opción | Pros | Contras |
|---|---|---|
| A · No fusionar hasta migrar en alojado | Simple | Bloquea toda la integración, porque la migración depende de U04 y de ventanas |
| B · Sondeo de esquema en tiempo de petición (consulta `head:true`, `PGRST205` → oculto) | Automático | Confunde «tabla ausente» con «error transitorio»: un fallo de red podría convertir una exportación v3 en v2 incompleta. **No recomendado para exportación** |
| **C · Capacidad explícita, server-only, desactivada por defecto + verificación al activarla** | Determinista; sin cambios en Production al fusionar; reversible quitando la variable | Requiere disciplina para activarla después de migrar |

**Recomendación: C.**
1. Crear `src/lib/capabilities.ts` con una función `n2Enabled(module)` que lea variables de servidor, por ejemplo `RUBIK_N2_SEO`, `RUBIK_N2_COMPETITORS` y después `…_CONTENT` y `…_GEO`, por defecto **desactivadas**.
   Así, al fusionar no hay que tocar ninguna variable de Production y Production queda igual que `main`.
2. **Navegación:** `PROJECT_SECTIONS` marca `available` según la capacidad. Desactivada, la entrada aparece como «No disponible todavía» con `Unavailable`, o se oculta.
   Las rutas llaman a la capacidad **antes** de consultar y responden con `Unavailable` (sin consultas). Las acciones de servidor rechazan con `error=no-disponible`.
3. **Exportación:**
   - desactivada: el v2 actual sin cambios, añadiendo a `notIncluded` el texto «seo/competitors: módulo no activado en este entorno»;
   - activada: v3, y cualquier error es 503 como ahora.
   Nunca degradar de v3 a v2 por un error de lectura.
4. **Salud:** `/api/salud` informa `n2: { seo: "disabled|enabled|schema-missing" }`. Con la capacidad activada, una comprobación de esquema
   (`select … limit 0`) debe pasar; si falla, la salud marca `schema-missing` y las rutas responden 503 honesto.
5. **Activación posterior (propietario):** aplicar las migraciones en el entorno autorizado, verificar pgTAP y RLS allí, activar la variable de ese entorno y comprobar la salud.
   **Reversión:** quitar la variable. Los datos se conservan y RLS sigue activa.
6. **Pruebas:**
   - unitarias de la capacidad y de la navegación;
   - integración: exportación v2 con capacidad desactivada y v3 con capacidad activada;
   - E2E con las capacidades activadas en `playwright.config.ts`, como hoy, más un caso con capacidad desactivada que muestre `Unavailable` sin errores de consola.
7. **Dependencias:** Preview sigue bloqueada (#88). Este plan no la desbloquea ni la valida.

---

## 8. Decisiones exclusivas del propietario

- Si `main` despliega automáticamente a Production y si se acepta fusionar con la capacidad desactivada [no comprobado: no consulté Vercel].
- Ventanas, entorno y respaldo para aplicar migraciones N2 en Supabase alojado; orden de aplicación (U02/U03/U04).
- Política R1/R3:
  - restauración entre entornos con autores ausentes (D-3);
  - retención y borrado de cuentas frente a `created_by` (R-3);
  - tablas no exportadas preexistentes (`provider_budgets`, `provider_spend`, `project_invitations`, `audit_idempotency`).
- Si las keywords requieren auditoría S1 y si un analista puede borrarlas (R-2).
- Activación de proveedores (OpenSEO competidores/backlinks/rank, GSC/GA4/Bing de N2-10, motores generativos de N2-13), OAuth/credenciales y presupuestos.
- Desbloquear la facturación de GitHub Actions.
- Política comercial y editorial de contenidos/GEO antes de exponerlos a clientes.

---

## 9. Próximos pasos

**Para Codex:**
- **Acción:** en la rama de #120, el lote 0 de §5:
  - B-1;
  - capacidad N2 (§7);
  - R-1;
  - R-4;
  - R-2, R-3 y R-5 o su aceptación documentada;
  - los tests de §3.5;
  - las capturas.
- **Evidencia de cierre:** nuevo SHA de #120 con todos los gates de §6 en PASS en un stack exclusivo, incluido el paso de tipos de CI con exit 0
  y la prueba «capacidad desactivada → exportación v2 idéntica a `main`», registrados con SHA y entorno.
- **Motivo:** son los únicos bloqueantes de merge y despliegue de #120. Ninguno requiere operaciones alojadas.

**Para Juanma:**
- **Acción:**
  - confirmar si `main` despliega a Production;
  - decidir si se fusiona #120 con la capacidad desactivada;
  - decidir D-3, R-2 y R-3.
- **Evidencia de cierre:** decisión escrita en `docs/CONTROL-PROYECTO.md` o en la PR, con fecha.
- **Motivo:** sin esas decisiones el código puede estar listo, pero su efecto en Production y en la recuperación (U04) queda indefinido.

---

## 10. No comprobado

- **Despliegue automático de `main` a Vercel Production y esquema alojado real:** no consulté Vercel ni Supabase alojado, por las restricciones de esta tarea.
  La ausencia de tablas N2 en alojado se toma de los documentos.
- **Integración y E2E combinadas** (#120 + #119, #120 + #116 + #117): no ejecutadas. Solo `tsc`, unitarias y pgTAP observados.
- **Las cifras de #120 en `b359650`** (verify 512, integración 119, pgTAP 718, E2E 157/50/0): comunicadas. Solo repetí pgTAP 718/718.
- **El 404 → 200 de `/medicion` en #119:** inferido de mi observación directa en N2-11 con la misma versión de Next. No reproducido en #119.
- **Los 2 fallos de `claude-s1-stack.test.ts` en el entorno Windows del propietario (#119):** no reproducidos aquí. En mi árbol #120+#119 pasan 515/515.
- **Que `PGRST205` sea el único código ante tabla ausente** en la versión alojada de PostgREST.
- **La revisión visual completa:** solo abrí dos capturas SEO de #120. Las de Competidores las inspeccioné en su día en #115.
