# Checkpoint de Claude Code · N2-11 Competidores (primer incremento)

Propio de Claude. No reescribe el Roadmap Maestro, `CONTROL-PROYECTO.md` ni `CODEX-AUTONOMIA-ESTADO.md`,
y **no marca N2-11 como operativo**.

| Campo | Valor |
|---|---|
| Rama | `claude/n2-11-competitor-intelligence-v1` |
| Base | `main@d12b80ee4c229ab8c90f1044ecd0108165f8bb2e` |
| HEAD | ver `git ls-remote origin refs/heads/claude/n2-11-competitor-intelligence-v1` (el último commit actualiza este checkpoint) |
| PR | Draft (ver la PR de la rama); sin fusionar |
| Worktree | `/home/user/rubik-n2-11` (contenedor efímero; todo está en GitHub) |
| Stack | `rubik-claude-s1-20261015`, 127.0.0.1:57321/57322, propio y desechable; el de Codex no se ha tocado |
| Estado | Batería local completa en HEAD `60e76fb` (árbol limpio): verify 499/499, integración 111/111, pgTAP 695/695, E2E 149 PASS / 46 SKIP / 0 FAIL, limpieza sin residuos. CI de GitHub: ver la PR |

## Hecho

- Fase A: [matriz de capacidades y costes](N2-11-COMPETIDORES-FASE-A-20261016.md); ninguna API activada.
- Fase B: [módulo de competidores](N2-11-COMPETIDORES.md): migración `20261016100000` con RLS, grants por
  columna, triggers de integridad y recibos S1 atómicos; rollback de contención; lógica pura
  (normalización, comparación honesta, histórico); páginas y acciones de servidor; contratos de
  backlinks/rank tracking desactivados.
- Pruebas nuevas: pgTAP `n2_11_competitors` (54), unitarias `competitors.test.ts` (20), integración
  `competitors.integration.test.ts` (10), E2E `competitors.spec.ts` (flujo + 3 anchos).

## Errores y correcciones durante el bloque

- `loading.tsx` de ruta convertía los 404 (id ajeno o inexistente) en 200: sustituido por `Suspense`
  tras las comprobaciones de acceso; cubierto por E2E.
- La comparación ocultaba la lectura «no disponible» del competidor cuando faltaba la del sitio
  propio: cada celda muestra su última lectura; cubierto por E2E.
- Selector truncado y desplegable sin 44 px en 360 px: etiquetas cortas con ayuda y estilo `.legend`.
- Recuento esperado de recibos mal sumado en pgTAP (9→10); punycode esperado escrito a mano
  corregido con `node:url`.

## Pendiente y bloqueos

- Autorización del propietario: aplicar la migración en alojado; decisiones D-N2-11-1..4 (Fase A).
- Exportación de proyecto sin competidores (evita conflicto con #113).
- `docs/ROADMAP.md` y `docs/HANDOFF.md`: solo una línea de relevo; el control canónico es de Codex.

## Reanudación en un paso

```bash
git clone https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO rubik-n2-11 && cd rubik-n2-11 && git checkout claude/n2-11-competitor-intelligence-v1 && npm ci && node scripts/claude-s1-stack.mjs start && . test-results/claude-s1-stack/env.sh && node scripts/verify-s1-local.mjs
```
