# Cola de ejecución Claude Code — N1-04 → N1-03/S1

**Fecha de registro:** 15/10/2026. **Objetivo:** mantener progreso sin esperar créditos de Codex; preservar trabajo paralelo, evitar dos escritores en una rama y completar S1 con evidencia por SHA. Este documento es una instrucción de relevo, **no un programador automático**. Para que Claude la ejecute debe recibir la instrucción en su sesión activa o al reanudarla.

## Identidades y estado de referencia (reconciliar al empezar cada paquete)

- Repositorio: `Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO`.
- `main` observado al crear la cola: `520e4119bafe8a9ce4b2293faad2e54b8e6d81d8`.
- **Claude N1-04 (PRIMERA PRIORIDAD):** rama `claude/n1-04-ci-entornos-20261015`, último SHA observado `b5df91bed67d64030a9f798b77cacca7358f65f6`; continúa en otro worktree. No asumir que el trabajo está finalizado ni que existe PR hasta consultarlo.
- **Codex S1 (SEGUNDA PRIORIDAD):** [PR #104](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/104), OPEN/Draft, rama `codex/s1-trusted-audit-writer-20261015`, HEAD observado `41512756ac1ce80934692d1722fd41bd95993933`. Codex no dispone ahora de créditos, pero dejó código, [HANDOFF](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/blob/codex/s1-trusted-audit-writer-20261015/docs/HANDOFF-S1-20261015.md) y checkpoints publicados.
- Propuestas independientes del supervisor basadas en S1, **sin pruebas PostgreSQL nuevas ejecutadas por el supervisor**: [#105 rollback RPC](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/105), [#106 preservación de recibos](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/106), [#107 drenaje justo/fail-closed](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/107). Están abiertas como Draft, dirigidas a la rama S1, no a `main`.
- No tocar nunca `FLOOR PLAN`, `CODEX_HOME` ni los worktrees/perfiles de otras aplicaciones.

## Paquete A — Terminar N1-04 ANTES de tocar S1

1. Continúa **la sesión ya iniciada**, sin reemplazarla por un encargo S1 de forma inmediata. Recupera `AGENTS.md`, `CODEX-AUTONOMIA.md`, Roadmap Maestro y `docs/N1-04-CI-ENTORNOS-PREPARACION-20261015.md`.
2. Termina todas las tareas independientes autorizadas: preflight y reproducibilidad de CI sin mentir sobre Actions, guardas fail-closed de Preview, documentación para Supabase Preview aislado, ensayos locales sin tocar Production, pruebas de configuración y riesgo de secretos.
3. Ejecuta las verificaciones dirigidas y las necesarias para el HEAD final **en el entorno propio**. No utilices los contenedores, bases, fixtures o puertos de Codex S1. GitHub Actions está bloqueada por facturación: ninguna anotación `FAILURE` sin pasos ejecutados cuenta como fallo de una suite; tampoco como PASS.
4. Corrige defectos, `git commit`, `git push`, checkpoint N1-04 propio y PR Draft (si procede) desde su rama al `main` que GitHub confirme. No fusiones automáticamente.
5. Congela la escritura en N1-04 una vez publicado el informe: SHA, archivos, pruebas, riesgos, U02 y última acción. **Solo después pasa al paquete B**. U02 no está aprobada: no crear Supabase alojado, cambiar variables, desbloquear Preview, activar facturación ni pagar.

## Paquete B — Relevo S1 en worktree NUEVO y aislado

**No reutilices** el worktree de Codex `test-results/s1-writer`, cuyo stack S1 usa API `56321`, DB `56322` y conserva un ledger E2E ambiguo. No reiniciarlo, resetearlo, pararlo, cambiar sus credenciales ni eliminar fixtures. Crea otro worktree y un stack desechable distinto con nombre, puertos y volúmenes verificados **propios de Claude**. Si los tests y scripts están fijados a 56321/56322, adapta cuidadosamente el runner para usar tu stack sin desproteger sus comprobaciones de destino; no apuntes al stack de Codex por comodidad.

1. Tras publicar y congelar N1-04, haz `git fetch origin --prune`; comprueba `main`, PR #104/105/106/107, HEAD remotos, estado de worktrees, `git status`, eventos y posibles cambios de otros agentes. No atribuir SHA histórico al código actual.
2. Lee `docs/DECISION-U01-APROBACION-20261015.md`, `docs/HANDOFF-S1-20261015.md` y `docs/S1-IMPLEMENTACION-LOCAL-20261015.md` **de la rama #104**, más sus checkpoints, `AGENTS.md` y Roadmap Maestro.
3. Crea una rama nueva `claude/s1-integration-review-20261015` **desde el HEAD actual de #104**, no desde `main` ni desde N1-04. No escribas en `codex/s1-trusted-audit-writer-20261015`. Si esa rama cambió durante el relevo, vuelve a evaluar los diffs antes de mezclar.
4. Recupera de las PR de revisión SOLO sus commits/diffs propios, en orden [#105](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/105) → [#106](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/106) → [#107](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/107), mediante cherry-pick selectivo o copias de archivos verificadas. **No fusiones PRs automáticamente** ni arrastres de nuevo toda la base S1. Revisa que los archivos nuevos no destruyen trabajo posterior de Codex.
5. Ejecuta primero sintaxis y tests dirigidos, después regresiones SQL, integración, unitarias, seguridad y Playwright con tu stack. Acredita especialmente: (a) rollback RPC 190000 que mantiene bloqueo de HMAC, (b) proyectos y organizaciones con recibos pendientes, incluidos DELETE concurrentes, (c) drenaje sin writer devolviendo 503 y sin inanición con más de 25 recibos, (d) permisos por tabla y columna, RLS, suplantación, JWT caducado, revocaciones, cadena dañada y rotación de keyring. Los tests nuevos de #105-107 estaban **propuestos, no ejecutados**, y pueden necesitar correcciones.
6. Completa los riesgos **no cubiertos**: recibo transaccional entre persistir resultado Google/OpenSEO y evento de auditoría; reintento tras commit incierto sin repetir llamadas a proveedores; política de retención efectiva al eliminar proyecto; recuperación/drenaje con alertas y fallos de credenciales; exportación/restauración; secuencia segura de migración y rollback. Si hay una decisión reservada (retención legal, secretos, gasto o política comercial), documenta opciones y solicita aprobación en lugar de inventarla.
7. No aceptes pruebas de un commit previo como si cubrieran el HEAD de integración. Ejecuta el runner completo local sobre el último SHA o informa con precisión cada prueba que no hayas podido ejecutar y por qué; no rebajes tests. Preserva ledger ambiguo de Codex sin tocarlo.
8. Haz commits/push recuperables, actualiza un **checkpoint S1 propio en la rama de integración** sin reescribir la historia de Codex. Abre una PR **Draft desde tu rama S1 hacia la rama S1 de Codex** para auditoría de ChatGPT; no fusionar automáticamente #104 ni ninguna PR derivada.
9. Entrega informe: matriz cambio → evidencia → SHA → entorno, estado de S1, resultados y número de SKIP, diferencias de migración/rollback, riesgos restantes, PR, y operaciones alojadas todavía pendientes. Si todos los criterios locales están satisfechos, declarar `S1 LISTO PARA AUDITORÍA DE FUSIÓN`, **no** `S1 ALOJADO` o `S1 COMERCIAL`.

## Reglas generales de continuidad y costes

- Máximo progreso autónomo en tareas locales, reversibles y ya aprobadas (U01); no exigir permiso por cada ajuste menor.
- No tocar Supabase alojado, credenciales reales, Vercel Production, variables de entorno remoto, cuentas de cliente, pagos, servicios externos con coste ni CI billing sin autorización independiente. U02 y aplicación alojada S2 siguen pendientes.
- No introducir un scheduler, alertas remotas o borrado de pruebas alojadas sin validación operativa.
- Si se agota la cuota de Claude, asegurar commits, push, PR y checkpoint; la reanudación de créditos requiere un nuevo arranque salvo programación autorizada.
- Una sola rama de producto S1 activa por agente. **No solapar escritura de Claude y Codex sobre el mismo HEAD**.
- Si Codex reanuda créditos mientras Claude trabaja S1, asignarle otro paquete separado y evitar que ambos editen S1 hasta completar el relevo.

## Criterios de cierre

- **N1-04**: entregado localmente y bloqueos U02 documentados con PR lista para revisión; no se exige crear Preview alojada sin autorización.
- **S1**: pruebas actuales de todas las migraciones, writer, outbox, RPC y funciones de negocio; trazabilidad externa duradera; negativos de permisos y claves; rollback seguro y ordenado; documentación precisa. La fusión final y la aplicación en base alojada permanecen bajo supervisión separada.
