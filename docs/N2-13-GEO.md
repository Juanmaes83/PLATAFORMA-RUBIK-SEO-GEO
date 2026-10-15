# N2-13 · GEO e IA con evidencia (primer incremento)

Estado: **implementado y probado en local; no operativo en ningún entorno alojado.** Rama
`claude/n2-13-geo-evidence-v1`, base `main@d12b80e`, independiente de N2-11 (#115) y N2-12 (#116).

## Inventario previo (B1)

| Pieza | Dónde | Uso en N2-13 |
|---|---|---|
| Contrato AI Citation Monitoring (Release E) | Core `@rubik/seo-geo-core/authority` (`normalizeCitationObservation`, `SOURCE_TYPES`, `OBSERVATION_STATUSES`) | Vocabulario reutilizado: mención ≠ cita, entidad propia/competidor, proveedor/modelo, procedencia `MANUAL`. Registro Core por observación (`coreCitation`). |
| Escritor confiable S1, outbox, recibos | `main` | Recibos `geo.*` en la misma transacción, firmados después. |
| Proyectos, organizaciones, roles, RLS | `main` | Mismo patrón y matriz Core. |
| Contenidos y briefs (N2-12) | PR #116, Draft | Adaptador `contentTarget`: «no integrado». |
| Competidores (N2-11) | PR #115, Draft | Adaptador `competitorNames`: «no integrado». |
| Keywords (N2-09) | PR #114, Draft (Codex) | Adaptador `keywordQuestions`: «no integrado». |
| Consultas automáticas a motores | — | **No existen ni se activan.** Sin autorización, proveedor ni presupuesto. |

**Discrepancia con el Core (propuesta, sin modificarlo):** `normalizeCitationObservation` marca como
`MEASURED` una lectura manual en la que aparece la marca. La plataforma la muestra como **declarada**
hasta que una persona con `approve-fact` la verifica. Propuesta para el Core: un estado `DECLARED`
para procedencia `MANUAL` no verificada.

## Qué puede hacer un usuario

Pestaña «GEO e IA» (`/proyectos/[tenantId]/[projectId]/geo`):

1. **Registrar observaciones manuales**: marca/entidad, motor declarado (ChatGPT, Claude, Gemini,
   Perplexity, AI Overviews, Copilot u otro) y modelo opcional, consulta exacta, fecha observada
   (distinta de la de registro), idioma/país si se conocen, método de obtención, presencia (citada,
   mencionada sin cita, no aparece, no está claro), fragmento relevante (≤4000), URLs citadas (≤20,
   texto, nunca visitadas), otras entidades mencionadas y referencia a la evidencia original.
   Registro idempotente (misma lectura una vez).
2. **Verificación humana**: declarada → verificada, por titular o aprobador del cliente; la base de
   datos registra quién y cuándo. No se deshace.
3. **Correcciones versionadas**: una observación no se edita; la corrección es una nueva que la
   sustituye en el análisis y conserva el historial.
4. **Panel**: oportunidades priorizadas, consultas observadas por **serie comparable** (misma
   consulta, mercado, motor y método; motores distintos no se comparan), observaciones con filtros
   por motor, estado y texto de la consulta, propuestas y fuentes/límites.
5. **Oportunidades deterministas y explicables**: hueco de respuesta, mencionada sin cita, se citan
   otras fuentes, respuestas inestables (≤31 días), repetir la medición (una sola lectura) y mantener
   la cita. Cada una con problema, evidencia, hipótesis, acción sugerida, prioridad con motivo
   (limitada a media mientras no haya evidencia verificada en dos motores) y limitaciones.
6. **Propuestas revisables**: el servidor reconstruye la oportunidad desde las observaciones guardadas
   (el formulario solo nombra regla y consulta); revisión por titular o gestor de cuenta: pendiente →
   aceptada/rechazada → hecha; reabrir una rechazada.

No se calculan rankings, porcentajes de visibilidad ni frecuencias de cita. llms.txt, schema o
Wikidata/Wikipedia no se recomiendan como garantía de aparición.

## Permisos

| Operación | Acción Core | Roles | Barrera en BD |
|---|---|---|---|
| Leer | `read` | miembros | SELECT `is_project_member` |
| Registrar observaciones y propuestas | `draft` | owner, account-manager, analyst | INSERT + grants por columna |
| Verificar observación | `approve-fact` | owner, client-approver | UPDATE solo `verification` + trigger |
| Aceptar/rechazar/cerrar propuesta | `review-action` | owner, account-manager | trigger BEFORE |
| Borrar | `delete-data` | owner | DELETE |

## Seguridad

RLS y FKs compuestas por proyecto/organización; una corrección o una propuesta no puede apoyarse en
observaciones de otro proyecto; texto hostil guardado como dato y mostrado escapado (prueba E2E con
`<img onerror>`); URLs solo http(s), sin credenciales, mostradas como texto; ninguna petición sale
de la plataforma (prueba de integración que intercepta `fetch` durante todo el flujo); recibos S1
con la lista de acciones reconstruida de forma aditiva (convive con `competitor.*` y `content.*`).

## Migración, rollback y dependencias

- `supabase/migrations/20261016160000_n2_13_geo_observations.sql`; rollback de contención
  `supabase/rollbacks/20261016160000_n2_13_geo_observations.sql` ensayado con datos y reaplicado.
- **#113:** `geo_observations` y `geo_proposals` no entran todavía en exportación/recuperación →
  **no listo para datos reales** hasta integrarlas.
- **#115/#116:** orden de migraciones compatible con el bloque aditivo; N2-11 debe adoptarlo (ver #116).
- Archivos compartidos: `navigation.ts` (+6, entrada antes de «Conectores»), `database.types.ts`
  (regenerar al integrar), `globals.css` (regla `textarea` **idéntica** a #116),
  `src/types/rubik-seo-geo-core.d.ts` (+ declaración mínima del subpath `authority`).
- No aplicada en alojado.

## Limitaciones

- Observaciones manuales: dependen de cuenta, ubicación, fecha y modelo; sin repetición sistemática.
- Fecha observada validada en UTC (00:00–02:00 Madrid no admite «hoy»).
- Sin subida de capturas (la evidencia original se referencia como texto).
- 500 observaciones por vista; sin paginación.
