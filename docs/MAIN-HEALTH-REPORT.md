# Salud de `main` tras CORE-9.2 y CORE-9.3

**Fecha:** 2026-10-07.

## CI posterior al merge (GitHub Actions, evento `push` a `main`)

| Repo | Commit | Run | Resultado |
|---|---|---|---|
| PLATAFORMA-RUBIK-SEO-GEO | `2beed3a` (merge de #6) | [37643881138](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37643881138) | **success**: verify Node 22 y 24 (lint, tsc, Vitest y build) y e2e (pgTAP, integración y Playwright contra el Supabase local) |
| PLATAFORMA-RUBIK-SEO-GEO | `d0cfb93` (merge de #5) | [37643439526](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37643439526) | **cancelled**: la canceló la concurrencia del workflow al llegar el push de `2beed3a`. Ese commit no tiene CI propia; la de `2beed3a` lo incluye |
| RUBIK-SEO-GEO-CORE | `8a1f808` (merge de #19) | [37623434170](https://github.com/Juanmaes83/RUBIK-SEO-GEO-CORE/actions/runs/37623434170) | **success** |

## Reproducción local de `main@2beed3a`

Entorno: Linux, Node 22.22.0, npm 10.9.4, Docker 29.8.2, Supabase CLI 2.118.0. Partiendo de `npm ci` limpio:

| Comprobación | Resultado |
|---|---|
| `check:core-pin` | `8a1f80883b83536d02301d073259b010f696409b` |
| `check:secrets` | Correcto |
| lint y typecheck | Sin errores |
| Vitest | 78/78 |
| build | Correcto |
| `test:db` (pgTAP) | 137/137 |
| `test:integration` | 24/24 |
| `test:e2e` | **No ejecutado en local**: el Chromium del contenedor (build 1194) no es el que espera `@playwright/test` 1.63. Lo cubre la CI de `2beed3a` |

## Conclusión

`main` está sano en los dos repos.

Riesgo abierto: un merge seguido de otro push en menos de 5 minutos deja el primer commit sin CI propia (concurrencia con cancelación). Es aceptable porque el commit siguiente lo contiene, pero conviene saberlo al leer el historial de Actions.
