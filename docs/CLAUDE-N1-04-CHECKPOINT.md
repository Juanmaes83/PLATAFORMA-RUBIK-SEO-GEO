# Checkpoint de Claude Code · N1-04 (CI y entornos)

Documento propio de Claude Code. **No sustituye** a `docs/CODEX-AUTONOMIA-ESTADO.md` ni a `docs/CONTROL-PROYECTO.md`, que mantiene Codex/supervisor.

## Estado al cierre de esta sesión (15/10/2026)

| Campo | Valor |
|---|---|
| Repositorio | `Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO` |
| Rama | `claude/n1-04-ci-entornos-20261015` |
| Base | `main@520e4119bafe8a9ce4b2293faad2e54b8e6d81d8` (sin cambios en `origin/main` al cerrar) |
| HEAD de la rama | ver `git ls-remote origin refs/heads/claude/n1-04-ci-entornos-20261015` (el último commit es este checkpoint) |
| PR | PR_PLACEHOLDER |
| Worktree | Clon propio en contenedor efímero de Claude Code en la nube (`/home/user/plataforma-rubik-seo-geo`). Se pierde al cerrar la sesión: **todo está en GitHub** |
| PR de Codex observada | #104 OPEN Draft, HEAD `41512756ac1ce80934692d1722fd41bd95993933`, base `520e411` |

## Trabajo completado

1. Auditoría de `ci.yml` (15 puntos) y de contratos Development/Testing/Preview/Production.
2. `scripts/ci-local/`: preflight con 10 categorías de diagnóstico y runner que ejecuta los bloques `run:` reales de `ci.yml` con evidencia ligada a SHA.
3. Pruebas nuevas: `tests/ci-local-workflow.test.ts`, `tests/ci-local-checks.test.ts`, `tests/preview-fail-closed.test.ts`, `tests/preview-data-paths.test.ts`.
4. Paso nuevo en `ci.yml`: smoke HTTP de Preview con control negativo verificado.
5. Ejecución completa de la CI local (ver resultados en [N1-04-CLAUDE-CI-LOCAL-Y-ENTORNOS §3](N1-04-CLAUDE-CI-LOCAL-Y-ENTORNOS-20261015.md)).
6. Documentos: plan de activación U02, hoja de decisión U02, protocolo N1-05.

## Errores encontrados y corregidos en la sesión

- Falso positivo del detector de `.only` (cadena en un fixture) → lexer que ignora literales/regex/comentarios + regresión.
- Control negativo del smoke Preview que no fallaba: un `next-server` superviviente respondía en el puerto → `set -m`, `trap` y comprobación de puerto libre.
- Tipos inferidos `{}` desde JS en tests → JSDoc en `workflow.mjs`.
- Resumen de pgTAP tomaba el primer `Result:` (FAIL esperado en el paso Studio) → se registran todas las ejecuciones.

## Dependencias de Codex

- **H1:** añadir `if (previewLocked(process.env)) return null;` al inicio de `writerPool()` en `src/lib/provenance/writer.ts` (#104). Sin ello, `tests/preview-data-paths.test.ts` falla tras combinar ambas ramas.
- Cuando #104 se fusione: rebasar esta rama sobre el `main` nuevo, revisar que la guarda estática detecta y acepta el escritor ya protegido, y repetir la CI local.

## Riesgos y bloqueos

- GitHub Actions bloqueado por facturación (U02-a). La evidencia local **no** es CI verde.
- Sin Preview aislada (U02-b…f). Preview sigue bloqueada por código.
- Desviaciones de la evidencia local: solo Node 22 (falta la pata 24), Chromium 141 en vez del 153 de Playwright 1.63, imágenes Supabase desde Docker Hub.
- H2: posible compartición de variables Supabase de Production con Preview, pendiente de inventario del propietario.

## Próxima acción exacta

1. Si #104 sigue abierta: comprobar si Codex aplicó H1 (`git fetch origin codex/s1-trusted-audit-writer-20261015 && git show FETCH_HEAD:src/lib/provenance/writer.ts | grep -n previewLocked`).
2. Si #104 está fusionada: `git fetch origin main && git rebase origin/main`, resolver conflictos (no se esperan: archivos disjuntos), `npm ci`, `node scripts/ci-local/run.mjs`, actualizar §3 del documento N1-04 y este checkpoint, push.
3. Pendiente de U02: ejecutar el plan de activación (lo hace el propietario).

## Reanudación en un solo paso

Desde cualquier máquina con `gh` autenticado y Docker:

```bash
git clone https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO rubik-n1-04 && cd rubik-n1-04 && git checkout claude/n1-04-ci-entornos-20261015 && git log --oneline -5 && gh pr list --head claude/n1-04-ci-entornos-20261015 && gh pr view 104 --json state,headRefOid,mergedAt && npm ci && node scripts/ci-local/preflight.mjs
```

Después leer `AGENTS.md`, `CODEX-AUTONOMIA.md`, este checkpoint y el documento N1-04 de Claude antes de modificar nada. No hay reanudación automática configurada: la sesión se reinicia manualmente.
