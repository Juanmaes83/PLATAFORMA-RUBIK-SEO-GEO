# Handoff / prompt para Claude Code — Integración N2 de Rubik SEO/GEO

**Fecha:** 16/10/2026. **Repositorio:** `Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO`. **Propósito:** avanzar la consolidación de las capacidades N2 en una aplicación coherente, sin perder pruebas, aislamiento ni seguridad durante los merges.

## Mandato

Actúa como agente técnico autónomo para auditoría y preparación de la siguiente integración. No te limites a describir lo que podrías hacer: inspecciona GitHub, compara los diffs y deja un informe concreto, reproducible y útil para continuar. No inventes estado desde este documento: cada sesión debe reconciliarlo con GitHub y el checkout actual.

La prioridad es consolidar código probado en ramas en una secuencia revisable. Las pruebas locales son evidencia real de ese entorno, pero no significan CI GitHub verde, Supabase alojado validado ni producto listo para clientes.

## Estado que debes comprobar al iniciar

- `main`: `b6555eaa8190ed8668c501813fda01e06c75163c` al corte; verificar HEAD actual.
- #113 está MERGED: N1-06 exportación/recuperación segura y evidencia local N1-05.
- #120 está OPEN/Draft, rama `codex/n2-integration-post113-20261016`, último HEAD reportado `b3596500f1d5cd867d2e006c05d2454677d7843c`, base b6555ea.
- #120 consolida N2-09 (#114) y N2-11 (#115), la navegación/tipos y recuperación/exportación SEO v3. **No dupliques ni propongas fusionar #114 o #115 por separado.**
- El propietario ejecutó en Windows y sobre el SHA b359650: `npm run verify` 512/512; integración 119/119; pgTAP 718/718; E2E 157 PASS/50 SKIP/0 FAIL; cleanup de 11 usuarios y 2 organizaciones ficticios propios, sin residuos. GitHub Actions no ejecutó pasos por facturación.
- #119 (N2-10 medición), #116 (N2-12 contenidos) y #117 (N2-13 GEO) siguen OPEN/Draft con base antigua `d12b80e`. #118 (N2-14 informes) sigue OPEN/Draft y solo contiene diseño/contrato; no tiene funcionalidad de informe.
- No hay migraciones N2 acreditadas en Supabase alojado. H1 parcial, H2 bloqueado. Acciones U02/U03/U04 y decisiones R1/R3/R4/R7 siguen pendientes.
- El merge de código en `main` puede afectar al despliegue Vercel asociado a `main`. SEO/Competidores consultarían tablas nuevas ausentes en Supabase alojado. El propietario ha prohibido tocar Production y migraciones alojadas.

## Límites no negociables

- No tocar FLOOR PLAN, sus worktrees, sesiones, configuraciones o credenciales.
- No modificar Supabase alojado, Production, secretos, variables de Production, Vercel routing/deploy, ni datos reales.
- No ejecutar `db push`, `db reset`, limpieza global ni tests sobre un stack no identificado. No consultar proveedores ni incurrir en gasto.
- No afirmar CI verde: los jobs de Actions quedaron bloqueados por facturación y no ejecutaron pasos.
- No cambiar, reescribir, hacer force-push ni borrar ramas ajenas. No modificar el worktree/checkout del propietario o de Codex.
- Mientras #120 siga abierta, la regla del repositorio permite solo análisis, arquitectura y documentación independiente: **no abras otra PR de producto ni modifiques el código de #120**.
- No fusiones nada. La autorización permanente de merge no elimina los gates de revisión ni las prohibiciones de Production.

## Tu trabajo inmediato: auditoría paralela sin interferencia

Trabaja en un worktree propio y aislado. Primero verifica `git status`, HEAD, remotos y worktrees; conserva cualquier cambio preexistente. Lee, en este orden, `AGENTS.md`, `CODEX-AUTONOMIA.md`, `docs/ROADMAP-MAESTRO-2026.md`, `docs/CONTROL-PROYECTO.md`, `docs/CODEX-AUTONOMIA-ESTADO.md`, el checkpoint de #120 y los documentos de diseño de #116/#117/#118. Contrasta cada afirmación con GitHub.

Entrega un informe auditado con:

1. **#120:** lista de commits y archivos; confirma que las funciones de #114/#115 quedaron incluidas; revisa export v3/manifest v2, restricciones same-project, recuperación idempotente, lectura fallida/parcial, recibos/outbox, grants y rollback; busca errores de integración, contratos previos v1/v2, huecos RLS y acciones de auditoría que una migración posterior pudiera borrar.
2. **Colisiones restantes:** compara el HEAD de #120 con #119, #116 y #117; prepara una matriz archivo → ramas que lo modifican → resolución segura. Examina en particular `navigation.ts`, `database.types.ts`, `globals.css`, migrations/rollbacks, tipos de exportación/manifest, RPCs, RLS y la lista de acciones de auditoría.
3. **Cobertura de recuperación:** inventaría las tablas que cada módulo nuevo persiste y confirma cuáles entran hoy en exportación v3/restauración. Señala exactamente qué quedaría fuera para contenidos y GEO; propone una evolución versionada compatible con archivos anteriores, sin implementarla en esta fase.
4. **Despliegue seguro:** describe alternativas de compatibilidad para que mergear #120 no deje rutas/enlaces SEO y Competidores rompiendo contra el esquema alojado ausente. Compara ocultación fail-closed, disponibilidad por capacidad y secuencia de migración en entorno aislado. Recomienda la opción menos riesgosa y especifica pruebas, reversión y dependencias. No configures la solución ni cambies Vercel/Supabase.
5. **Orden de integración posterior:** recomienda lotes pequeños para #119, #116/#117 y #118, indicando dependencias, pruebas mínimas y criterio de salida de cada lote. No dupliques el trabajo ya incluido en #120.
6. **Informe ejecutivo:** hechos verificados, inferencias etiquetadas, incertidumbres, riesgos, qué puede ejecutarse ahora y qué necesita al propietario. Cada evidencia debe incluir enlace/commit/SHA y entorno.

## Orden posterior previsto (sujeto a tu auditoría)

1. Completar auditoría externa del HEAD #120 y resolver una solución fail-safe para producción/esquema ausente. Mantenerlo Draft hasta entonces.
2. Después de integrar #120 por proceso supervisado, rebasar y validar #119 (N2-10).
3. Integrar #116 y #117 con ampliación firmada de exportación/recuperación para sus tablas, respetando formatos anteriores y lista aditiva de acciones de auditoría. Aislamiento organizacional/proyecto obligatorio.
4. Hacer funcional N2-14 (#118) como primer informe manual, de solo lectura, con procedencia, cobertura y limitaciones explícitas. Nada de scheduler, envíos, IndexNow o proveedor automático hasta aprobación.
5. Retomar N1-05/N1-06 alojados y H1/H2 únicamente cuando existan entorno aislado, respaldo y autorizaciones U02/U03/U04/R1/R3/R4/R7.

## Entrega y parada

- No cambies código de producto ni el HEAD de #120. Puedes crear un informe Markdown local en tu worktree propio para este análisis; no abras PR ni lo publiques sin coordinar.
- Si necesitas documentar el informe, crea un archivo local con fecha y entrega su ruta, sin añadirlo a ramas ajenas.
- Ejecuta solo verificaciones estáticas/read-only compatibles con las restricciones.
- Si una tarea parece requerir una operación alojada, una variable/secreto, gasto o acceso real, deja un paso concreto preparado y continúa con lo demás.
- Devuelve resumen, cambios locales efectuados, fuentes consultadas, diferencias halladas, dependencias y comando siguiente exacto. No te limites a pedir al propietario que repita información que ya está en GitHub o en este handoff.

