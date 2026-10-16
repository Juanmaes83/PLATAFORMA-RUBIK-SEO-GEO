# Handoff #120 · resolución N2 · 16/10/2026

## Estado de trabajo

- Repositorio: `Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO`.
- Rama: `codex/n2-integration-post113-20261016`.
- PR existente: [#120 Draft](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/120). No crear PR de producto adicional ni fusionar.
- Este handoff se actualizará con el SHA publicado cuando finalice el gate.
- Informe Claude fuente: `8a48fa9969463e227c0c72389d09fe985c2aa9f1`, consultado por URL; su rama documental no se integró.
- Resolución y matriz: [REVISION-INTEGRACION-N2-CLAUDE-RESOLUCION-20261016.md](REVISION-INTEGRACION-N2-CLAUDE-RESOLUCION-20261016.md).

## Cambios que ya existen en el worktree

- Capacidad de esquema N2 fail-closed por variable; rutas, navegación y acciones SEO/Competidores comprueban esquema disponible.
- Export apagado declara omisiones, no adjunta manifiesto y queda `UNPROVEN`; con N2 encendido los errores no degradan a una exportación completa.
- S1 receipts de keywords, `updated_at` estampado por servidor y borrado reservado a `delete-data`.
- Inventario del esquema verificable contra la lista local de tablas; exclusiones explicadas.
- Restore conserva autores originales y aborta antes de escribir cuando faltan identidades.
- Migración rollback SEO deja datos/RLS retenidos y revoca acceso en vez de eliminar la tabla.
- El allowlist S1/N2 del outbox se fija acumulativamente en el orden canónico de migraciones; un helper dinámico produjo listas anidadas y se eliminó.
- El verificador local usa la misma selección de stack para PostgREST, pgTAP, generación de tipos y conexión del escritor.

## Evidencia de validación a este handoff

- `npm run verify`: 58 archivos / 514 pruebas unitarias; lint, tipos, análisis de secretos, pin y build PASS.
- Integración contra stack local exclusivo `rubik-n2-audit-20261016`: 20 archivos / 121 pruebas PASS.
- pgTAP en la misma base: 25 archivos / 728 aserciones PASS.
- Playwright completo está en ejecución/repetición. Primer intento: 156 PASS, 50 SKIP, 1 FAIL por una prueba que atribuyó borrado a analyst; prueba dirigida corregida: 1 PASS. Actualizar la cifra tras repetir suite completa.
- No GitHub Actions PASS: facturación la bloquea antes de pasos. No hubo Supabase alojado, Vercel Preview, proveedores ni datos reales de Sarah.

Actualización de cierre de gates: Playwright completo **157 PASS / 50 SKIP / 0 FAIL** (207 casos, 4.7 min); pgTAP completo tras añadir el ensayo transaccional de rollback **26 archivos / 734 pruebas PASS**.

## Decisiones humanas pendientes

- U02/U03 para validación alojada; no realizarla sin autorización.
- Aceptación del contrato de descarga parcial `UNPROVEN` con N2 deshabilitado, si se desea mantener esa descarga. Nunca llamar COMPLETE a una exportación que no leyó todos los datos que su versión declara incluir.
- La propuesta de Claude de interruptores adicionales o formato futuro v4 no es una decisión aprobada. Mantener inventario, firma, verificación y restauración alineados antes de ampliar formatos.
- Política legal/comercial para retener o anonimizar cuentas autoras; no reasignar sus firmas a operadores de restore.

## Continuación sin repetir trabajo

1. Repetir `npm run verify` tras cerrar cambios de documentación y capturas visuales opcionales.
2. Ejecutar `git diff --check`, revisar árbol, commit/push fast-forward, comentar matriz en #120 y confirmar estado Draft/HEAD exacto.
3. Actualizar este handoff y el documento de resolución con cifras y SHA final; ejecutar `git diff --check`, `npm run verify` y comprobar árbol limpio.
4. Commit y push fast-forward a la rama de #120; añadir comentario con matriz y evidencia; verificar PR abierto/Draft, HEAD exacto y que no se fusionó.
5. Si el crédito se agota, continuar en este worktree/branch y no reiniciar la batería que ya está en la matriz.
