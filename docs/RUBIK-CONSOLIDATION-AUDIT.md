# Auditoría de consolidación de Rubik

> **Vigencia (09/10/2026):** fotografía histórica. El estado actual está en el bloque «Estado vigente» de [ROADMAP](ROADMAP.md) y [OPERATIONS-STATUS](OPERATIONS-STATUS.md).

> **Nota de vigencia (2026-10-07, posterior):** el PR [#7](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/7) que este documento describe como abierto está **FUSIONADO** en `main` con el merge `fd8ef5600b6757d995afff33655c17ee4285a227`. La CI del push a `main` ([run 37655703584](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37655703584)) terminó en **success**. El texto siguiente se conserva como fotografía histórica tomada antes del merge.

**Fecha:** 2026-10-07 · **Agente:** Claude Code.

**Método:**

- `git fetch` de todas las ramas remotas de RUBIK-SEO-GEO-CORE y PLATAFORMA-RUBIK-SEO-GEO.
- Para cada rama:
  - commits fuera de `main` (`git rev-list main..rama`);
  - comparación de su versión de cada fichero con la de `main`;
  - estado del PR en la API de GitHub.

**Límites:**

- No se han borrado ramas: el `CLAUDE.md` de ambos repos pide conservarlas.
- Sin worktrees ni cambios locales ajenos visibles en este contenedor.

## 1. Resumen

| Repo | `main` | PRs abiertos | Ramas con trabajo que no está en `main` |
|---|---|---|---|
| RUBIK-SEO-GEO-CORE | `8a1f808` (merge de #19) | **0** | **0** |
| PLATAFORMA-RUBIK-SEO-GEO | `2beed3a` (merge de #6) | 1: [#7](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/7), normalizador Lighthouse, de esta sesión | **0**, sin contar #7 |

`main` es la fuente de verdad en los dos repos. No queda trabajo válido varado en ramas.

## 2. Core: ramas remotas

| Rama | PR | Commits fuera de `main` | Situación | ¿Se puede borrar? |
|---|---|---|---|---|
| `feat/core-9-2-provenance-boundary` | #19 fusionado | 0 | En `main` | Sí, candidata |
| `feat/core-8-1-offpage-operations` | #13 fusionado | 0 | En `main` | Sí, candidata |
| `feat/core-8-offpage-authority` | #12 fusionado | 0 | En `main` | Sí, candidata |
| `feat/core-7-1-openseo-bridge` | #11 fusionado | 0 | En `main` | Sí, candidata |
| `feat/core-7-provider-contracts` | #10 fusionado | 0 | En `main` | Sí, candidata |
| `feat/core-6-multilingual` | #9 fusionado | 0 | En `main` | Sí, candidata |
| `feat/core-3-2-neutral-intelligence` | #7 fusionado | 0 | En `main` | Sí, candidata |
| `feat/core-3-1-entity-products` | #6 fusionado | 0 | En `main` | Sí, candidata |
| `feat/core-3-explicit-injection` | #3 fusionado | 0 | En `main` | Sí, candidata |
| `feat/seo-geo-core-extraction` | #1 fusionado | 0 | En `main` | Sí, candidata |
| `docs/core-9-platform-spec` | #14 fusionado | 0 | En `main` | Sí, candidata |
| `docs/core-8-9-closeout` | #15 fusionado | 0 | En `main` | Sí, candidata |
| `docs/retain-remote-branches` | #16 fusionado | 0 | En `main` | Sí, candidata |
| `docs/core3-closeout-ecosystem` | #5 fusionado | 0 | En `main` | Sí, candidata |
| `docs/core-3-2-closeout-core6` | #8 fusionado | 0 | En `main` | Sí, candidata |
| `docs/core-1-closeout` | #2 fusionado | 0 | En `main` | Sí, candidata |
| `sculpt/import-seo-geo-core` | sin PR | 0 | Origen de la importación; contenido en `main` | Sí, candidata |
| `docs/core9-execution-plan` | #17 fusionado **con squash** | 12 (los originales) | Su contenido entró con el squash. 5 de 9 ficheros difieren de `main` solo porque `main` siguió evolucionando | Sí, candidata. Comprobar el diff antes de borrar |
| `docs/core9-ux-direction` | #18 fusionado **con squash** | 4 | Igual que la anterior | Sí, candidata. Comprobar el diff antes de borrar |
| `docs/ecosystem-reference-review` | #4 **cerrado sin fusionar** | 7 | **Sustituida.** Los 5 ficheros que toca existen en `main`; la revisión del ecosistema entró por #5 (`c2893cd`, «docs: add SEO GEO ecosystem review») | Sí, candidata, con conformidad del propietario |

## 3. Plataforma: ramas remotas

| Rama | PR | Commits fuera de `main` | Situación | ¿Se puede borrar? |
|---|---|---|---|---|
| `feat/core-9-0-bootstrap` | #1 fusionado | 0 | En `main` | Sí, candidata |
| `feat/core-9-1-supabase-auth-tenancy` | #2 fusionado | 0 | En `main` | Sí, candidata |
| `fix/core-9-1-rls-auto-enable-privileges` | #3 fusionado | 0 | En `main` | Sí, candidata |
| `feat/core-9-2-persistence-provenance` | #5 fusionado (`d0cfb93`) | 0 | En `main` | Sí, candidata |
| `feat/core-9-3-manual-import` | #6 fusionado (`2beed3a`) | 0 | En `main` | Sí, candidata |
| `docs/plan-desarrollo-piloto-sarah-2026-10-07` | #4 **cerrado sin fusionar** | 6 | **Sustituida a propósito:** el paquete documental se trasladó a `Juanmaes83/sarahkaterina` (`website/02-activation/seo-geo-piloto-sarah/`, PR #33 fusionado), por decisión del propietario | Sí, candidata |
| `feat/lighthouse-import-normaliser` | #7 abierto | 1 | **Activa.** Trabajo de esta sesión con pruebas locales en verde | No |

## 4. Documentación frente a realidad

| Afirmación | Dónde | Verificado en `main` |
|---|---|---|
| CORE-9.2: `audit_events`, `provider_results`, keyring HMAC, firma y exportación o borrado | ADR 0004, migración `20261007120000` | Sí: las tablas están en la migración y existen `src/lib/provenance/{audit,keyring,results,repository}.ts`. pgTAP `audit_provenance.test.sql` |
| CORE-9.3: `rubik-import-v1`, tabla `imports`, importar, abrir, exportar y borrar, auditoría e interfaz | ADR 0005, migración `20261007150000` | Sí: `src/lib/imports/{contract,repository,actions,labels}.ts`, las rutas `importaciones/`, `importaciones/[importId]` y `exportar/route.ts`, y pgTAP `imports.test.sql` |
| Orden de migraciones | `supabase/migrations` | `20260928120000` → `20260928150000` → `20261007120000` → `20261007150000`. Sin colisiones ni inversiones |
| ROADMAP marcaba 9.2 y 9.3 como «en PR» | `docs/ROADMAP.md` | **Desfasado.** Lo corrige el PR #7 |
| «No hay ningún despliegue» | `docs/HOSTING.md` | Coherente: no hay configuración de despliegue en el repo ni evidencia de URL |

## 5. Lista de limpieza para aprobación del propietario

Aquí no se borra nada. Si el propietario lo aprueba, se pueden borrar:

- **Core:** las 20 ramas de §2.
- **Plataforma:** las 6 ramas de §3, excepto `feat/lighthouse-import-normaliser`.

**Antes de borrar:** el `CLAUDE.md` de ambos repos dice que las ramas se conservan. Hace falta una instrucción nueva y expresa que levante esa regla.
