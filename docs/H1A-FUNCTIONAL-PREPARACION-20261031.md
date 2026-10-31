# H1-A funcional · preparación local de una única campaña ficticia

## Alcance y precedencia

Contrato `MVP_FUNCTIONAL_ACCEPTANCE` **ratificado por Juanma** en [#154](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/154), HEAD `3a35528f4cd08432f61fc302664e8074177f269d`; se ha leído el documento de esa revisión. Orden acotada de revisión de [#145](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/145) sobre `1553f6902f92268726557b6bf41e1d3aabf0729f`. Base main comprobada `ba21a08033e58d0808dd74189edbcdc989f82dbb`. #154 aún no integrada en ese main. Las referencias antiguas a ratificación o elección R1 pendientes son cortes históricos: ratificación y elección **R1-SNAPSHOT** ya están aprobadas.

**Preparación exclusivamente local. Ninguna campaña alojada, deployment, proveedor, dato de Sarah ni fusión.** Los commits nuevos se conservan locales: un push de la rama vinculada puede disparar Vercel y la revisión prohíbe desplegar. #145 permanece Draft. Cuando #154 esté integrada se reconciliará mediante merge con main, sin reescribir historial.

## Evidencia reutilizada y límites

- U03/I-2/I-5: reutilizar el PASS alojado del run `330c6e4b-14ad-439a-a8cf-43d92c73fadb` para controles sin cambios. No se ha repetido U03 alojado.
- El gate XHR original, su interceptación CDP y los expedientes históricos permanecen intactos/BLOCKED. Esta preparación añade un escenario funcional independiente. No afirma que las cancelaciones históricas sean inocuas.
- El export actual conserva manifiesto firmado y verificación offline. **No garantiza snapshot entre superficies bajo concurrencia**; esta campaña ficticia usa fixtures estables. R1 se prepara por separado en [#155](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/issues/155), sin incluir aquí su diseño ni migraciones.
- N1 local, 27 versiones hasta `20261015210000`: el informe debe indicar con veracidad las superficies N2 no disponibles. No se activa ni aplica N2 alojado.

## Escenario reproducible

`npm run test:h1a-functional-local` ejecuta primero regresiones sin base, crea fuente/destino **propios por UUID** (API `127.0.0.1:65421`, DB `:65422`; restauración separada `:63522`), verifica esquema e identidad y usa build de producción + Chromium real.

Lote mínimo local: cuatro actores funcionales ficticios y un testigo ajeno al lote; organizaciones A/B y organización testigo; proyectos A1/A2/B1; un resultado GSC sintético firmado por proyecto, un import manual A1 y recibos de invitación/retirada. GSC: 37 clics, 101 impresiones, fecha `2026-10-01`, propiedad `sc-domain:fixture.invalid`. El transporte del proveedor está simulado; cero llamadas reales.

Se prueban login real, navegación por enlaces, medición/informe en 1280 y 390 px, datos y límites visibles, accesibilidad crítica/seria, cuerpos necesarios completos, A2/B1 positivos y A1 ajeno/inexistente denegado, permisos retirados, costes/egreso cerrados, GET export autenticado, manifiesto, tamper rechazado y restore real dos veces con identidad/columnas iguales. Se prueba además el transporte padre/hijo existente de restore. Logout requiere redirección completa y denegación posterior.

El clasificador funcional reconoce **solo** hints explícitos `next-router-prefetch: 1/2/3` de Next 16.4.3 y `purpose: prefetch`; valores desconocidos siguen siendo necesarios. La evidencia fuente es `node_modules/next/dist/client/components/segment-cache/cache.js`, que emite los tres valores. Esto no modifica el clasificador/gate forense ni certifica cancelaciones históricas. Sin respuesta necesaria completa o sin efecto funcional, el caso falla.

Toda eliminación de organizaciones de este escenario usa UUID registrados tras una inserción correcta y vuelve a comprobar ID/slug antes de borrar por ID; IDs no registrados se rechazan antes de SQL. El testigo se conserva durante la limpieza A/B y se comprueba por huella SQL y usuario. Solo después se retira ese testigo, también creado por este runner. Nunca se barre por dominio de correo ni se usa el helper administrativo de selección por slugs. La fuente exige lectura SQL independiente con cero usuarios, organizaciones, proyectos, audit/results/imports y outbox; escritor y políticas temporales se retiran. En destino se comprueba la limpieza SQL del restore y después la retirada total del stack del transporte padre/hijo; no se presenta una instancia ya retirada como una consulta SQL posterior. La evidencia PASS solo se escribe después de retirar ambos stacks propios y verificar SHA/digest y código sin cambios pendientes.

## Correcciones de producto comprobadas localmente

- El enlace de apertura del Panel y `ProjectNav` usan enlaces HTML, con una respuesta de documento completa por navegación. Se conservan URLs, clases, roles y `aria-current`. No se presume integridad de una respuesta RSC por el hecho de ver una pantalla. Coste: recarga completa y posible latencia adicional; requiere revisión del HEAD antes de desplegar. La prueba con solo `prefetch={false}` no resolvió el problema de manera estable.
- Los dos formularios visibles de salida usan `POST /api/auth/logout`. La ruta comprueba Origin/Host, HTTPS o loopback numérico, media y longitud declarada antes de Auth; ignora datos/redirects del formulario. Usa el mismo cliente de clave pública y guardas Preview, el mismo `auth.signOut()` y cookies SSR. Solo devuelve 303 al confirmar éxito; cliente no disponible o fallo Auth devuelve 503 sin detalles privados. La Server Action anterior permanece compatible, sin modificarla.
- No cambian RLS, permisos, escritores, formato/manifiesto, migraciones, `api/auth/login`, operadores U03 ni gate forense. El transporte de logout **sí es nuevo**: su validación alojada queda pendiente de la futura campaña; no se hereda un PASS alojado para esa ruta.

## Resultados de esta preparación

**Preflight local PASS** sobre `2e04e5072b2dc7aada5c348aeb635823ee6a7506`: **6 PASS / 0 FAIL / 0 SKIP**, las 15 fases PASS. La misma sesión de navegador inicia, ve datos firmados en escritorio/móvil, entrega su cookie al GET export real y cierra sesión solo después de verificar, rechazar tamper y restaurar dos veces en destino aislado. El proyecto fuente sigue existiendo al probar la denegación tras logout. Fuente/destino propios retirados; testigo preservado y lectura SQL de fuente cero. **H1-A funcional alojado sigue NOT_RUN; H1/H2/U04 no se cierran.**

| Comprobación realmente ejecutada | Resultado |
| --- | --- |
| `npm run verify` | 661 PASS / 1 SKIP; lint, tipos, build, pin Core; 823 archivos escaneados |
| Regresiones offline de preflight/egreso | 24 PASS / 0 FAIL / 0 SKIP |
| Logout/login y guardas Preview dirigidos | 32 PASS / 0 FAIL |
| H1-A local, HTTP real + Chromium + restore | 6 PASS / 0 FAIL / 0 SKIP |
| Preflight offline de ventana | local PASS; alojado BLOCKED; ejecución alojada NOT_RUN |
| pgTAP, integración global, E2E global y CI del nuevo candidato | NOT_RUN; no se confunden con el CI del HEAD remoto anterior |

Primera evidencia saneada conservada en `docs/evidence/H1A-FUNCTIONAL-LOCAL-2e04e50-20261031.json`; ledger local `mvp-functional-dbdc24c8-d929-43af-8916-2eee4d614865.jsonl`, run del runner `1426ca32-09dc-4236-ad9f-c98831856a8b`. Capturas locales revisadas visualmente: medición en 1280/390 e informe móvil. El runner emite una evidencia nueva ligada al HEAD exacto al repetir el escenario; la primera evidencia no se presenta como prueba automática de otro SHA.

**FAIL previos conservados:** setup ESM Windows/timeout; espera/recargas del arnés; etiqueta CSS del informe; clasificación de hints; `d4482f2` 2 PASS/1 FAIL; `ef5e57a` y `85f271d` 4 PASS/1 FAIL por respuesta RSC sin final; prueba de solo precarga desactivada insuficiente; `9949b44` navegador PASS y export posterior al logout 500; `1a934fb` 5 PASS/1 FAIL por POST Server Action de logout sin final. El orden se corrigió para mantener una sola sesión; el logout usa ahora POST documental. Todos los ensayos retiraron sus stacks propios, mantuvieron el bloqueo y conservaron sus ledgers parciales con `testsPassed:false`; no se reetiquetan como PASS. Un primer lint detectó un generador temporal propio `.cjs`: se conservó como texto no ejecutable y los lint posteriores pasaron. Ninguno de estos resultados atribuye causa o inocuidad a cancelaciones históricas.

## Preflight alojado preparado, sin ejecutar

`npm run preflight:h1a-functional -- <evidencia-local.json>` es un **validador offline**, sin función para desplegar ni ejecutar una campaña. Su plan está en `H1A-FUNCTIONAL-PREFLIGHT-PLAN-20261031.json` y conserva valores no acreditados como null/false. Solo puede producir `READY_FOR_OWNER_AUTHORIZATION`; nunca otorga autorización ni sustituye las atestaciones reales del operador U03 existente. Los booleanos del plan son resumen de evidencias que deberá revisar el operador, no una firma criptográfica por sí mismos.

Condiciones: contenido ratificado idéntico en main (también tras squash), evidencia local completa del SHA/digest exactos, Preview ref `rhnnplewqsekrnaousyl`, esquema N1 exacto, deployment protegido ligado a SHA, signing keyring disponible sin imprimir claves, escritor mínimo ligado a runId/SHA con TTL 60–900 s, flags Google/catálogo/pago false, inventario independiente con antigüedad máxima 5 min y cero recursos/outbox propios, preservación de ajenos y contención NOLOGIN/terminar sesiones propias/limpieza por IDs/backup acotado. Production `yvdgmklgwlshizzgefpv` se rechaza.

Estimación del futuro ensayo: **un run**, lote ficticio acotado del tamaño anterior, un artefacto firmado, restore doble local aislado; ventana de escritor máximo 15 minutos. El endpoint de fixtures alojado existente produce 1 clic/1 impresión en su fila sintética: el operador comprobará esos valores y el JSON firmado. El ensayo local usa 37/101 como variante de medición, no se afirma identidad byte a byte con el fixture alojado ni se cambia la ruta U03 para igualarlos. El manifiesto operativo debe fijar filas, actores/IDs y deltas antes de autorizarlo. Si no cabe en la ventana, contener/limpiar y devolver BLOCKED, sin renovar ni repetir automáticamente. Coste de proveedores: cero.

Falta #154 en main; después, merge controlado de ese main en #145, revisión del HEAD (incluido el cambio de transporte), y autorización específica de publicación/deployment protegido y una ventana alojada ficticia con nuevas atestaciones e inventario. No se solicita aún operar mientras falte ese prerrequisito. La revisión explícita del diseño/privilegios R1 exigida por #155 antes de añadir una migración es una decisión separada; no bloquea la campaña ficticia.
