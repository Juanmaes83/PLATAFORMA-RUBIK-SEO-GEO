# Handoff nocturno de Claude Code — 16/10/2026

Propio de Claude; no sustituye `CONTROL-PROYECTO.md` ni `CODEX-AUTONOMIA-ESTADO.md`. Nada se ha fusionado,
desplegado ni aplicado en alojado. CI de GitHub no se ejecuta (bloqueo de facturación): la evidencia es local y
está ligada a cada SHA.

## Estado verificado

- `main` remoto: `d12b80ee4c229ab8c90f1044ecd0108165f8bb2e` (sin cambios durante la sesión).
- PR abiertas (todas Draft): #113 N1-06 (Codex, `55074b2`), #114 N2-09 (Codex, `e68fbd4`), #115 N2-11 (Claude,
  `52ce3a1`), **#116 N2-12 (Claude, `f394cdb`)**, **#117 N2-13 (Claude, `852b1b3`)**, PR de diseño N2-14 (esta rama).

## Bloques

| Bloque | Estado | Rama · HEAD | PR | Evidencia local (SHA de código) |
|---|---|---|---|---|
| N2-11 Competidores | Terminado, en auditoría | `claude/n2-11-competitor-intelligence-v1` · `52ce3a1` | [#115](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/115) | `60e76fb`: verify 499, integración 111, pgTAP 695, E2E 149/46/0 |
| N2-12 Contenidos | **Terminado esta noche** | `claude/n2-12-content-strategy-v1` · `f394cdb` | [#116](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/116) | `637be49`: verify 494, integración 110, pgTAP 717, E2E 149/46/0 |
| N2-13 GEO con evidencia | **Terminado esta noche** | `claude/n2-13-geo-evidence-v1` · `852b1b3` | [#117](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/117) | `65f1d48`: verify 494, integración 108, pgTAP 689, E2E 149/46/0 (tras repetir 1 intermitente ajeno) |
| N2-14 Informes manuales | **Diseño + contrato** (no funcional, por dependencias) | `claude/n2-14-manual-report-design` | PR Draft de diseño | verify (unitarias 484/484), contrato 5/5 |

Ningún bloque parcial: N2-14 se limitó a diseño a propósito (5 de 8 secciones dependen de PR sin fusionar).

## Funciones nuevas visibles (local)

- **Contenidos** (`/proyectos/[t]/[p]/contenidos`): oportunidades con evidencia y respaldo (observado / declarado /
  hipótesis), clústeres pilar/soporte, posibles solapamientos, briefs H1–H3 con revisión borrador → revisión →
  aprobado → archivado atribuida; SEO local con GBP/reseñas/directorios no conectados.
- **GEO e IA** (`/proyectos/[t]/[p]/geo`): observaciones manuales declaradas → verificadas, correcciones versionadas,
  series comparables, filtros, oportunidades explicables y propuestas revisables. Ningún motor consultado.

Revisión visual: `docs/visual/{movil-360,movil-390,escritorio-1280}/40..46-*.png` (#116) y `50..55-*.png` (#117), o
`npm run dev` con el stack local.

## Entorno local

- Stack Supabase propio `rubik-claude-s1-20261015` (127.0.0.1:57321/57322) **en marcha**, recreado desde la rama
  N2-13 (migraciones de `main` + `20261016160000`). Desechable; los datos de prueba se limpiaron (sin residuos).
- Stacks ajenos (Codex 54321/55321/56321/59321) y FLOOR PLAN: no tocados.
- Worktrees propios: `/home/user/rubik-n2-11`, `rubik-n2-12`, `rubik-n2-13`, `rubik-n2-14`, todos limpios y
  empujados. Contenedor efímero: todo está en GitHub.

## Limitaciones de los datos

Sin volumen, dificultad, posiciones, tendencias, CTR, rankings ni visibilidad en IA: no hay fuente válida y no se
estiman. Observaciones GEO y de competidores son manuales y declaradas hasta su verificación.

## Dependencias entre PR

- **#113 primero:** las tablas de #115/#116/#117 no entran aún en exportación/recuperación → ninguno listo para
  datos reales hasta integrarlas.
- **Outbox:** #116 y #117 reconstruyen la lista de acciones de forma aditiva; #115 usa lista fija → si #115 se
  aplicara después de las otras, retiraría sus acciones. Antes de fusionar, dar a #115 el mismo bloque aditivo.
- **Archivos compartidos:** `navigation.ts` (hunks distintos), `database.types.ts` (regenerar tras cada fusión),
  `globals.css` (regla `textarea` idéntica en #116 y #117), `src/types/rubik-seo-geo-core.d.ts` (#117).
- Adaptadores «no integrado»: N2-12 ↔ N2-09/N2-11; N2-13 ↔ N2-09/N2-11/N2-12; N2-14 ↔ todos.

## Decisiones del propietario

1. Orden de auditoría y fusión de #113 → #114/#115/#116/#117.
2. Aplicación alojada de cada migración (ninguna aplicada).
3. N2-11 Fase A: activación OpenSEO de competidores/backlinks/rank tracking y presupuesto (D-N2-11-1..4).
4. N2-13: si se autoriza alguna consulta automática a motores (proveedor, términos de uso, coste).
5. Propuesta al Core: estado `DECLARED` para observaciones manuales no verificadas.
6. CI: resolver el bloqueo de facturación de GitHub Actions.

## Propuesta de siguiente paquete (comparativa)

| Opción | Valor comercial | Riesgo/coste | Recomendación |
|---|---|---|---|
| Integrar N2-09 y N2-11 (tras fusión) con N2-12/N2-13 | Alto: keywords y competidores alimentan oportunidades, briefs y GEO; convierte módulos aislados en un flujo | Bajo: código ya escrito, adaptadores listos | **1.º** |
| Integrar exportación (#113) de las tablas nuevas | Alto (requisito para datos reales) | Bajo | **1.º, en paralelo** |
| N2-10 conectores y medición (GSC/GA4 vía OpenSEO) | Muy alto: primera fuente medida para priorizar | Requiere credenciales y autorización alojada | 2.º, cuando el propietario lo autorice |
| Ampliar N2-12 (NAP declarado, calendario editorial) | Medio | Bajo | 3.º |
| Ampliar N2-13 (consultas automáticas) | Alto pero dependiente de proveedor, ToS y coste | Alto | Solo con decisión del propietario |
| N2-14 informe funcional | Alto para clientes | Bajo una vez fusionadas las PR | Tras las integraciones |

**Siguiente paquete exacto propuesto:** tras fusionar #113, «integración de exportación + adaptadores» —
añadir competidores, contenidos y GEO a la exportación firmada y activar los adaptadores N2-09/N2-11 en N2-12/N2-13
a medida que se fusionen, con pruebas de integración cruzadas. No empezar verticales nuevas.

## Reanudación

```bash
git clone https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO r && cd r && git checkout <rama> && npm ci && node scripts/claude-s1-stack.mjs start && . test-results/claude-s1-stack/env.sh && node scripts/verify-s1-local.mjs
```

En este contenedor Playwright necesita `PLAYWRIGHT_BROWSERS_PATH` apuntando a un Chromium 1243 compatible.
