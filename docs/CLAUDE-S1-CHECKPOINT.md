# Checkpoint de Claude Code · S1 (paquete B de la cola #108)

Propio de Claude. No reescribe `docs/HANDOFF-S1-20261015.md` ni `docs/CODEX-AUTONOMIA-ESTADO.md` de Codex.

| Campo | Valor |
|---|---|
| Rama | `claude/s1-integration-review-20261015` |
| Base | HEAD de #104 `41512756ac1ce80934692d1722fd41bd95993933` (rama de Codex sin cambios durante el relevo) |
| HEAD | ver `git ls-remote origin refs/heads/claude/s1-integration-review-20261015` (el último commit es este checkpoint) |
| PR | PR_PLACEHOLDER |
| Worktree | `/home/user/rubik-s1-claude` en contenedor efímero de Claude (se pierde al cerrar; todo está en GitHub) |
| Stack | `rubik-claude-s1-20261015`, 127.0.0.1:57321/57322, desechable; arrancar con `node scripts/claude-s1-stack.mjs start` |
| Estado | RESULT_PLACEHOLDER |

## Hecho

Ver [S1-INTEGRACION-CLAUDE-20261015.md](S1-INTEGRACION-CLAUDE-20261015.md): selector de stack propio; #105, #106 y #107 integradas y validadas contra PostgreSQL real (con correcciones); H1 (escritor bloqueado en Preview); regresiones heredadas de #104 corregidas (4 unitarias, 8 pgTAP); recibos duraderos Google/OpenSEO (`20261015210000`); negativos del escritor; limpieza de pruebas coherente con #106.

## Errores y correcciones durante el relevo

- `postgres` local no puede `SET ROLE rubik_audit_writer`: la pertenencia se concede solo dentro de la transacción de cada prueba pgTAP y se verificó que no queda (`set=f`).
- pgTAP no visible para el rol escritor: envoltorio que cambia de rol solo durante la sentencia probada.
- Residuos de integración por #106: helper de limpieza que purga solo pendientes propios y falla si el borrado no se completa; dos integraciones seguidas con 0 residuos.
- Prueba de revocación débil (cierre local): rehecha para revocar en el servidor.
- Prueba de inanición no discriminante: 25 envenenados y validación por mutación.

## Pendiente y bloqueos

- Decisiones: exportación con recibos pendientes (R1), retención legal (R3), alertas/scheduler (R4), registro de denegaciones (R7).
- Requiere autorización: migraciones alojadas, credencial real del escritor, pooler/Vercel (U02), fusión de #104.
- Codex: revisar y, si procede, incorporar esta rama en la suya; su stack y ledger no se han tocado.

## Reanudación en un paso

```bash
git clone https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO rubik-s1-claude && cd rubik-s1-claude && git checkout claude/s1-integration-review-20261015 && npm ci && node scripts/claude-s1-stack.mjs start && . test-results/claude-s1-stack/env.sh && node scripts/verify-s1-local.mjs --check
```

(En contenedores sin acceso a `public.ecr.aws`, exportar antes `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io`; para Playwright sin descarga, apuntar `PLAYWRIGHT_BROWSERS_PATH` a un Chromium compatible.) Leer `AGENTS.md`, `CODEX-AUTONOMIA.md`, la cola `docs/COLA-CLAUDE-N1-04-DESPUES-S1-20261015.md` (en `main`) y este checkpoint antes de modificar nada.
