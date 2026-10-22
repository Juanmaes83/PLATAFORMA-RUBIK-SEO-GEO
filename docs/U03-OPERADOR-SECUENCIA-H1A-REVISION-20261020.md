# Revision de preparacion del operador U03 / H1-A

Fecha: 20/10/2026. PR #143 OPEN/Draft. HEAD revisado: `bbb11c4179e90d8317c6fad2e4639e8060a8539a`. No se consulto ni modifico Supabase y no se crearon fixtures.

## Deployment disponible

- Vercel Preview deployment READY: `dpl_tpsS6xCm4vivCoh9Rsje74rfaeCw`.
- Host exacto: `plataforma-rubik-seo-g1z86z3n1-juanma-espinosas-projects.vercel.app`.
- SHA funcional: `bbb11c4179e90d8317c6fad2e4639e8060a8539a`, rama `codex/u03-final-gates-20261020`.
- La peticion anonima a `/api/salud` respondio 302 hacia el host de SSO de Vercel, consistente con Deployment Protection activa.
- `vercel env ls preview <rama>` devolvio cero variables especificas de la rama. El ambito Preview general contiene solo `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. No existen variables de ventana, `RUBIK_AUDIT_DATABASE_URL` ni `PROVENANCE_SIGNING_KEYS` en el ambito de rama que se inspecciono. No se imprimieron valores.

## Resultado de la auditoria de extremo a extremo

El operador existente **no es una secuencia U03/H1-A** y no debe ofrecerse como tal:

1. `-WindowRoleReadOnlyDiagnosticOnly` consulta PostgreSQL y termina; no encadena la prueba del rol.
2. `-WindowRolePreflightOnly` instala el rol con politicas restrictivas `USING(false)/WITH CHECK(false)`, demuestra contencion, activa el LOGIN solo para probar `SET ROLE`, prueba expiracion y retira rol/politicas en su propio `finally`. No mantiene el rol disponible para una campaña.
3. `runHostedU03Campaign` no conoce el nuevo rol, no instala politicas positivas acotadas ni hace contencion administrativa del rol temporal. El modo `cross-surface` usa tablas vacias para audit_events/provider_results/imports y acredita solo no divulgacion; el propio codigo indica que no fabrica filas firmadas.
4. Falta un flujo de aplicacion para crear un resultado de proveedor sintetico mediante el firmante real del servidor sin invocar proveedores. Imports tienen flujo legitimo, y exportacion HTTP existente firma el manifiesto, pero no hay orquestador que conecte estos recursos con IDs y recibos del run.
5. `scripts/u03-window-local-http-restore.mjs` prueba HTTP y restauracion entre stacks locales. No descarga el export HTTP del Preview ni restaura un artefacto alojado en un segundo stack local.
6. El codigo de la ventana de escritura exige configuracion de deployment/branch con DSN temporal y keyring. Esas variables no estan configuradas para la rama. El host unico generado por cada deployment tampoco se conoce antes de publicar sus variables; no se debe rellenar el pin con un alias implicito ni activar la guarda por aproximacion.

## Gates locales y alojados

| Fase | Estado en este corte | Evidencia |
|---|---|---|
| TLS Node -> Session pooler | PASS local, no repetido alojado | Regresiones publicadas en HEAD `bbb11c4`: socket TLS, CA/host fijados; `pg_stat_ssl` separado. |
| Preflight solo lectura del Preview | Pendiente de una ejecucion completa | No se pidio de nuevo Database password. El run alojado anterior con el gate erroneo no es un PASS. |
| Nuevo rol por Session pooler | BLOCKED / no ejecutado tras correccion | V-4 corresponde a otro rol; la prueba `WindowRolePreflightOnly` actual retira el rol y contiene escrituras. |
| I-2/I-5 poblados | BLOCKED | No existe en la rama un modo positivo firmado integrado con el rol y la ventana de deployment. |
| Export HTTP Preview -> restore local | BLOCKED | Solo existe el ensayo HTTP/local-local anterior; no prueba origen remoto Preview. |
| H1-A integral | BLOCKED | Faltan I-2/I-5 y el puente HTTP/restore alojado-local. |

## Requisitos antes de una unica ejecucion humana

La siguiente revision debe aportar, y probar localmente antes de ofrecer un comando:

- Una maquina de estados PowerShell/Node con fases numeradas: preflight read-only; instalacion NOLOGIN; prueba independiente real de NOLOGIN/terminacion; activacion; prueba de pooler; habilitacion de deployment; fixtures; firmas y recibos; export HTTP; verificacion/restauracion local; cierre de sesion; contencion; limpieza por IDs; lectura final; retiro de variables.
- Politicas temporales positivas solo para los slugs/IDs del namespace y run, aplicadas como restrictive policies sobre las tablas de writer; nunca eliminar la barrera de `rubik_audit_writer` fuera de la ventana.
- Un flujo autenticado que emita provider_results sinteticos pasando por el signer/`storeTrustedProviderResult` real, sin acceder a proveedores externos; import mediante el flujo de producto y todos los recibos procesados por el outbox existente.
- Un transporte protegido que aprovisione variables branch-specific sensibles, cree/despliegue el codigo con SHA exacto y verifique deployment id, host, proteccion, ref, variables y expiracion. Si el host no puede fijarse al deployment generado sin alias, fail closed y no habilitar escritura.
- Un unico manejo de Database password en memoria. Cualquier error tras intentar instalar el rol debe lanzar contencion administrativa independiente; si el operador pierde conectividad, mantener estado BLOCKED y conservar ledger/IDs.
- Pruebas de orden y fallo en cada frontera con dobles locales; prueba local de la ruta HTTP y restore en un segundo destino limpio. Ninguna debe presentarse como evidencia alojada.

Conclusion: el deployment de HEAD `bbb11c4` existe y conserva proteccion, pero **no es un deployment armado para la ventana**. No es seguro entregar ahora el comando de campaña solicitado: fallaria o podria dejar una ventana sin evidencia positiva de datos/recibos/restauracion. No se instalo rol, no se agregaron variables, no se desplego una configuracion de escritura, no se creo ningun fixture y no se repitio ninguna campaña previa.
