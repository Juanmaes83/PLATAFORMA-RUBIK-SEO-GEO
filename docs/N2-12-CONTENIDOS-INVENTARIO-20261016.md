# N2-12 · Etapa 1 — Inventario de datos y diseño funcional

Fecha: 16/10/2026 · Autor: Claude Code · Base: `main@d12b80ee4c229ab8c90f1044ecd0108165f8bb2e`.
Solo cuenta lo que existe en `main`. Lo que está en PR abiertas (#113, #114, #115) se trata como
**no integrado** y se conecta más adelante mediante adaptadores (ver «Contratos de integración»).

## Fuentes de datos reales en `main`

| Dato disponible | Dónde | Evidencia que aporta | Interpretación posible | Oportunidad | Acción recomendada | Limitaciones |
|---|---|---|---|---|---|---|
| Resultado de proveedor guardado (auditoría OpenSEO, capturas Google) | `public.provider_results`, firmado (HMAC servidor) | Páginas rastreadas (URL), incidencias por categoría/gravedad, fecha de captura; firma verificable con `loadProviderResult` | Una página existe; tiene incidencias técnicas u On-Page | Mejorar o actualizar una página existente | Vincular el resultado como evidencia «observada» y crear una oportunidad de mejora | Sin volumen, posiciones, CTR ni tráfico. Solo proyectos con OpenSEO configurado; lecturas Google desactivadas (`OPENSEO_GOOGLE_READS_ENABLED=false`) |
| Hallazgo importado (`rubik-import-v1`) | `public.imports` (findings: url, regla, gravedad, título, observación, propuesta) | Hallazgo declarado con fuente y fecha de captura | Problema detectado fuera de la plataforma | Mejorar/consolidar una página | Vincular la importación como evidencia «declarada» | Dato declarado, no verificado por un proveedor |
| Dominio del proyecto | `public.projects.domain` | Dominio autorizado del cliente | Delimita qué URLs son del proyecto | — | Validar que la página objetivo pertenece al dominio | Puede estar vacío; entonces la URL no se valida contra el dominio |
| Fuente manual del analista | Nueva (`content_evidence`, tipo `manual-source`) | Título, URL (texto, no se visita) y fecha de consulta | Lectura de un estudio, SERP revisada a mano, informe del cliente | Crear contenido nuevo o investigar | Registrar la fuente y la fecha | No verificada; la plataforma no abre la URL |
| Hipótesis del analista | Nueva (`content_evidence`, tipo `analyst-proposal`) | Razonamiento escrito | Propuesta sin datos | Investigar | Marcar «Propuesta del analista» | Nunca se presenta como medición |
| Keywords declaradas | #114 (N2-09, Codex) — **no integrado** | — | — | — | Adaptador futuro `KeywordSource` | Hasta su fusión: «No disponible» |
| Observaciones de competidores | #115 (N2-11, Claude) — **no integrado** | — | — | Brecha frente a competidor | Adaptador futuro `CompetitorEvidenceSource` | Hasta su fusión: «No disponible» |
| Volumen, dificultad, posiciones, tendencias, CTR | Ninguna fuente | — | — | — | — | **No se muestran ni se inventan.** La interfaz dice «No disponible» / «Pendiente de medición» |

## Modelo funcional del primer incremento

Proyecto → **Oportunidades** (con evidencias) → **Clúster temático** (pilar y soporte) → **Brief editorial**
→ **Revisión humana** (BORRADOR → EN REVISIÓN → APROBADO → ARCHIVADO). Nada se publica.

- La **prioridad** es una propuesta con motivo obligatorio. Si la oportunidad no tiene evidencia
  observada o declarada, se etiqueta «Prioridad basada en hipótesis».
- **Solapamientos**: se señalan como *posibles* (misma página objetivo o temas muy parecidos dentro
  del proyecto), nunca como canibalización confirmada: no hay datos de posiciones.
- **Enlaces internos propuestos**: derivados de la estructura del clúster (soporte ↔ pilar) y de los
  enlaces candidatos del brief.

## Contratos de integración (adaptadores, sin dependencia de PR abiertas)

- `KeywordSource` (N2-09): devolverá frases declaradas con idioma, país, intención y página objetivo;
  se usará para sugerir oportunidades. Hoy: implementación vacía con estado «no integrado».
- `CompetitorEvidenceSource` (N2-11): devolverá observaciones comparables de competidores como
  evidencia de brecha. Hoy: vacía, «no integrado».
- Exportación/recuperación (N1-06, #113): las tablas nuevas deben añadirse al paquete de exportación
  cuando #113 esté fusionada. Hasta entonces el módulo **no está listo para datos reales**.

## SEO local y reputación

Se evalúa tras completar el flujo principal: solo con datos declarados (NAP, áreas, páginas de
ubicación, observaciones documentadas). Google Business Profile, reseñas y directorios figuran como
**NO CONECTADOS**. Si compromete el incremento, pasa al siguiente paquete documentado.
