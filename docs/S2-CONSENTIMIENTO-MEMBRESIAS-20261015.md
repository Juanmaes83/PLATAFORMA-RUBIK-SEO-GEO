# N1-02 / S2 — consentimiento obligatorio de membresías

Base: `main@3eba9d014a339dabdabff28f42e27209695b0bf9`, con #97 fusionada.
Implementación: `5dad2c6` y documentación posterior. Estado: PROBADO LOCAL / PR EN REVISIÓN,
[PR #100](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/100) abierta en Draft, sin fusionar.
No hay aplicación alojada ni cierre de H1/H2 o del piloto Sarah.

## Cambio y auditoría

- Migración `20261015115750_membership_consent`: elimina las políticas de INSERT directo
  en `organization_members` y `project_members` y revoca INSERT de tabla y de todas sus
  columnas a PUBLIC/anon/authenticated. No modifica filas existentes.
- Se conservan SELECT, UPDATE(role), DELETE, RLS, claves foráneas, último owner y roles
  existentes. No se admite mover `user_id`, organización o proyecto mediante UPDATE.
- Los dos triggers de creación y `private.accept_project_invitation` mantienen owner
  `postgres`, SECURITY DEFINER y `search_path` vacío, comprobados por catálogo pgTAP.
  Los wrappers públicos siguen INVOKER; anon no acepta y los triggers no son RPC invocables.
- El destinatario confirmado acepta token de un solo uso, ligado a correo/proyecto/rol.
  Invitaciones pendientes no conceden acceso. No se añade RPC de alta con user_id arbitrario.
- Fixtures E2E, matriz #85, imports, provenance y captura Sarah usan invitaciones aceptadas
  con JWT del destinatario. Los fixtures SQL administrativos restantes son transaccionales
  y no se presentan como altas ordinarias permitidas.
- Negativos: INSERT/UPSERT incluso por owner; usuario sin org y usuario ya miembro de org;
  segundo proyecto sin consentimiento; correo ajeno; token usado; retirada de acceso;
  aceptación concurrente crea una sola membresía. Se conservan expiración/revocación,
  correo no confirmado, aislamiento A1/A2/B1 y roles de las suites existentes.
- La administración privilegiada de DB/Auth conserva sus permisos existentes; exige
  controles operativos propios. S2 impide altas directas del JWT ordinario, no elimina
  la capacidad administrativa ni cambia la gestión de roles de miembros ya consentidos.

## Entorno y límites de prueba

Stack propio `rubik-s2-consent-20261015`, API **http://127.0.0.1:55321**, DB **127.0.0.1:55322**,
Mailpit 55324. Separado del stack compartido en 54321/54322. Configuración ignorada en
`test-results/s2-stack/supabase`; mismo config del repo salvo project_id y puertos 543xx→553xx.
Se arrancó una base nueva y se aplicaron las 18 migraciones; no se ejecutó db reset ni stop.

Selección explícita en PowerShell, solo para procesos de pruebas:

```powershell
$env:SUPABASE_CLI = 'npx --yes supabase@2.118.0 --workdir test-results/s2-stack'
$env:RUBIK_TEST_ISOLATED_STACK = '1'
npm run verify
npm run test:integration
npm run test:db -- --local --workdir test-results/s2-stack
node scripts/test-membership-rollback.mjs
npm run test:e2e -- --reporter=dot
```

Para reproducir el stack: crear directorio ignorado vacío, copiar `supabase/{migrations,tests,templates,seed.sql}`
y config con esos cambios de project_id/puertos; ejecutar el comando `db:start` del package con
`--workdir test-results/s2-stack`. No copiar `.temp` ni un vínculo remoto. Antes de repetir pgTAP,
sincronizar las copias de tests con los archivos de la rama. No sobrescribir una configuración
preexistente ni arrancar si los puertos están ocupados. El resto de flags/proveedores permanece apagado.

El helper exige el par exacto API/DB; la selección aislada rechaza el stack compartido y
viceversa. Las pruebas de restauración comprueban además que el contenedor Docker publica
el puerto de DB seleccionado. La limpieza SQL usa el mismo CLI/workdir y una ruta absoluta
de archivo; mantiene preflight, locks y recibos de #97. Sin flag aislado, E2E sigue exigiendo
`127.0.0.1:54321`. Ninguna modalidad admite Supabase alojado.

## Evidencias realmente ejecutadas

| Verificación | Resultado |
|---|---|
| Regresiones sin DB antes del primer arranque | 13/13; ampliación final de guardas 18/18 |
| `npm run verify` | 403/403, 43 archivos; pin, secretos, lint, tipos y build correctos |
| Integración completa | 84/84, 13 archivos; matriz #85 y Sarah coexisten |
| pgTAP final | 581/581, 20 archivos; incluidos los dos asserts FK preservados |
| Rollback real + reaplicación | 10/10, una transacción revertida; usa archivos reales |
| Playwright | 145 PASS / 44 SKIP / 0 FAIL, 189 casos, 4,2 minutos |
| Auditoría de dependencias | Producción: 0; total: 5 altas preexistentes en herramientas de desarrollo; sin cambios de paquetes |

Las 44 omisiones de Playwright son skips existentes de las suites, no pruebas aprobadas.
Comprobación visual del flujo de invitaciones en escritorio y controles automáticos de
overflow/accesibilidad en los tres tamaños existentes; no se cambió UI de producto.

Primera integración: 71 PASS / 3 FAIL / 10 SKIP, además de dos hooks fallidos. Detectó el
contenedor fijo heredado de las restauraciones y una ruta relativa de limpieza al usar otro
workdir. La restauración rechazó el operador ausente antes de escribir. Tras corregir ambas
rutas y limpiar los dos recibos propios del ensayo fallido, segunda suite completa 84/84.
No se ocultaron fallos ni se relajaron asserts de aislamiento.

Huellas SHA-256 del stack compartido comprobadas idénticas tras la incidencia: **11 usuarios,
2 organizaciones, 3 proyectos, 6 membresías de organización y 7 de proyecto**, incluidos los seis
usuarios ajenos y fixtures legados. Comprobación final idéntica después de todas las suites.
Stack propio vacío antes y después de E2E: cero usuarios, organizaciones, proyectos y
membresías acumulados. Teardown: solo 11 usuarios y 2 organizaciones recibidos por la ejecución,
con sus descendientes. Se conserva el stack propio arrancado; no se detuvo el compartido.

## Rollback y riesgos residuales

`supabase/rollbacks/20261015115750_membership_consent.sql` restaura exactamente los permisos
por columna y las dos políticas anteriores, dentro de transacción. **Reabre S2**; solo usar
como contingencia revisada. No elimina membresías ni invitaciones. El ensayo local ejecuta
rollback, altas antiguas, reaplicación y denegación, y revierte toda la transacción externa.

La migración alojada sigue pendiente: requiere revisión del SHA, inventario de callers
administrativos externos, respaldo y autorización del propietario. Un merge del código no
certifica que la base alojada tenga S2 aplicado; hasta entonces permanece vulnerable allí.
No se cambiaron credenciales, Production, Vercel ni servicios de pago; cero llamadas reales
a GSC/GA4/OpenSEO. CI GitHub en `c772060` marca FAILURE en verify Node 22/24 y E2E,
pero ninguno de esos tres jobs se inició: las anotaciones del run `38734049022` confirman cuenta
bloqueada por facturación. No es CI verde. Vercel Preview SUCCESS no sustituye las pruebas ni
acredita aislamiento alojado. Revisar el nuevo HEAD después de cualquier checkpoint documental.

S1 sigue abierto y requiere U01; plan de N1-03 en [S1-PLAN-ESCRITOR-CONFIABLE](S1-PLAN-ESCRITOR-CONFIABLE-20261015.md).
No abrir otra rama de producto hasta la integración supervisada de S2.
