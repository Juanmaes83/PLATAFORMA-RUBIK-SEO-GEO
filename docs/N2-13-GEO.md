# N2-13 · GEO e IA con evidencia (primer incremento)

Estado: **integrado en local sobre `main@f5afc09` en la rama `claude/n2-12-13-integration-20261017`**
(sin PR ni merge); no operativo en ningún entorno alojado. Origen: #117 (`claude/n2-13-geo-evidence-v1`,
base `main@d12b80e`). Integración, contrato de recuperación y pruebas: [N2-12/N2-13 · integración sobre main](N2-12-13-INTEGRACION-20261017.md).

## Inventario previo (B1)

| Pieza | Dónde | Uso en N2-13 |
|---|---|---|
| Contrato AI Citation Monitoring (Release E) | Core `@rubik/seo-geo-core/authority` (`normalizeCitationObservation`, `SOURCE_TYPES`, `OBSERVATION_STATUSES`) | Vocabulario reutilizado: mención ≠ cita, entidad propia/competidor, proveedor/modelo, procedencia `MANUAL`. Registro Core por observación (`coreCitation`). |
| Escritor confiable S1, outbox, recibos | `main` | Recibos `geo.*` en la misma transacción, firmados después. |
| Proyectos, organizaciones, roles, RLS | `main` | Mismo patrón y matriz Core. |
| Contenidos y briefs (N2-12) | Esta misma integración | Adaptador `contentTarget`: «no integrado» (enlace pendiente). |
| Competidores (N2-11) | `main` (#120) | Adaptador `competitorNames`: «no integrado» (lectura pendiente). |
| Keywords (N2-09) | `main` (#120) | Adaptador `keywordQuestions`: «no integrado» (lectura pendiente). |
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
con la lista de acciones completa y fija (43 acciones: S1, SEO, competidores, contenidos y GEO).

## Migración, rollback y dependencias

- `supabase/migrations/20261017110000_n2_13_geo_observations.sql`; rollback de contención
  `supabase/rollbacks/20261017110000_n2_13_geo_observations.sql` ensayado con datos y reaplicado.
- **Exportación/recuperación:** incluidas en la exportación **v4** firmada (manifiesto v3); autores,
  verificadores y revisores se exigen al restaurar y nunca se sustituyen. Detalle: [N2-12/N2-13 · integración sobre main](N2-12-13-INTEGRACION-20261017.md).
- **Barrera:** `RUBIK_N2_CONTENT_GEO_SCHEMA_AVAILABLE=true` además de `RUBIK_N2_SCHEMA_AVAILABLE=true`.
- Autoría y verificación con FK a `auth.users` (retención, como `seo_keywords`).
- No aplicada en alojado.

## Limitaciones

- Observaciones manuales: dependen de cuenta, ubicación, fecha y modelo; sin repetición sistemática.
- Fecha observada validada en UTC (00:00–02:00 Madrid no admite «hoy»).
- Sin subida de capturas (la evidencia original se referencia como texto).
- 500 observaciones por vista; sin paginación.
