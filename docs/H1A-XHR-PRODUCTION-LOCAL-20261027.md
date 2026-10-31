# Auditoría local H1-A/XHR con Next.js en producción

Base auditada: PR #145 `cbae3cabfeeb5b7785ccf094b5e68c3d2f26dc7e`. Solo stack N1 local `rubik-h1a-src-2df8d657b4d9`, 27 migraciones, Auth local y build de producción. No hubo lectura o escritura de Preview. El ledger histórico `0e77ffc8-f58b-4698-a8ac-905438b1486f` conserva SHA-256 `256EE421EDF066A4AC2D7FE5B0B560823AA9A65803C39E78F1ADA5D3A28F1454`; sus datos no se reinterpretan.

## Método y resultados observados

`scripts/h1a-local-prod-build.mjs` compila con la API y clave publicable del stack loopback seleccionado. `playwright.h1a-prod-audit.config.ts` ejecuta Chromium en 1280 y 390 píxeles, con fixtures sintéticos del E2E y su cleanup por recibos de propiedad. `e2e/h1a-prod-xhr-audit.audit.ts` usa `installScopedRoutes` real y observa CDP por ID solo en memoria; el comparador sin `Fetch` conserva un bloqueo de salida externa mediante Playwright. El archivo `.audit.ts` solo se selecciona con esta configuración; no entra en el E2E general con `next dev`. La salida persistida contiene solo categorías y conteos.

En 22 ensayos de la misma build pasaron POST real de login HTTP 303, sesión, panel y vistas de proyecto, medición e informe, sin errores de consola o página. Los dos ensayos de identidad cruzada devolvieron 404 para medición e informe del proyecto ajeno. El recorrido usa estados vacíos de medición e informe, no filas firmadas; no demuestra independencia de datos poblados. Un primer intento del arnés ni siquiera llegó al navegador: Playwright transformó el módulo ESM del interceptor como CommonJS (`import.meta` inválido). La carga ESM nativa corrigió ese defecto del test; su cleanup retiró siete usuarios y dos organizaciones. Una comprobación posterior de lint/tipos falló por anotaciones del test y pasó tras tiparlas. Ninguno de esos fallos se atribuye al producto.

La versión instalada de Next documenta la precarga automática de `<Link>` en producción. `src/app/panel/page.tsx` y `src/components/AppNav.tsx` renderizan esos enlaces; el código instalado `next/dist/client/components/links.js` enlaza visibilidad/intención con `segment-cache/scheduler.js`, y `segment-cache/cache.js` envía RSC con `next-router-prefetch`. Esto acredita el mecanismo de esa **clase** local, no el iniciador exacto del ordinal alojado 23.

Comparaciones locales, dos repeticiones por variante y viewport:

| Variante | Control cambiado | Resultado funcional | Límite |
| --- | --- | --- | --- |
| Normal | Ninguno | Login, sesión y tres vistas PASS; RSC con cancelaciones y conteos variables | No identifica quién canceló cada ordinal |
| Hover | Intención sobre el enlace de proyecto | Mismos resultados; precargas observadas | El incremento de peticiones no fue estable entre repeticiones |
| Cancelar precarga | Una precarga del enlace de proyecto cancelada después de HTTP 200 y antes de devolver su cuerpo a Next | Cancelación instrumentada 4/4; petición directa posterior de la ruta 4/4; proyecto, medición e informe visibles | Prueba independencia de **esa precarga local**, no de otra solicitud ni de datos poblados |
| Navegar con precarga pendiente | Retener una respuesta de precarga tras HTTP 200 y navegar como documento | Navegación y vistas PASS 4/4 con petición directa; no se acreditó terminal para la precarga retenida | No equivale a navegación cliente ni convierte la petición pendiente en PASS |
| Sin interceptor CDP Fetch | Solo observación `Network` y bloqueo de origen externo | Login y vistas PASS; cancelaciones RSC también observadas | Descarta que Fetch sea condición necesaria para esta clase de cancelaciones locales, no su contribución a cada carrera |

El ensayo Windows previo de A/B/C mostró que `NETWORK_CANCELLED` después de HTTP 200 aparece tanto con aborto explícito como con desmontaje del frame. El experimento actual no atribuye ninguna de esas acciones al run alojado. `FRAME_DETACHED` y proximidad temporal tampoco demuestran causalidad. La solicitud alojada 23 sigue **INDETERMINADA**.

## Matriz de clase y fase

| Clase y fase | Propósito e iniciador acreditados | Consumidor / efecto de cancelar | Decisión de contrato propuesta |
| --- | --- | --- | --- |
| POST login y documento de `/panel` | Formulario y ruta Auth del producto; HTTP 303 y sesión verificados | Indispensables para sesión y panel | **NECESARIA**; no es precarga XHR |
| RSC de enlace de proyecto visible en panel, antes del clic | `<Link>` de proyecto + precarga Next; cabecera de precarga y objetivo del mismo enlace observados localmente | Caché anticipada; el cuerpo cancelado antes de su entrega se sustituyó por petición directa y las vistas vacías cargaron | **INDETERMINADA para el contrato H1-A**: independencia de esa navegación local demostrada, pero falta prueba con datos y permisos poblados del mismo run. El gate actual sigue BLOCKED |
| RSC/prefetch durante login y SESSION sin vínculo inequívoco con un enlace | Next static + señal RSC/prefetch observadas; no se asignó propósito por ordinal | Consumidor y resultado de cada cancelación no probados | **INDETERMINADA**; cancelación o falta de terminal bloquea |
| RSC de navegación cliente a un proyecto o vista | Navegación solicitada por el usuario; ruta y contenido vinculados | Necesaria cuando aporta el contenido visible; no se puede sustituir por una precarga asumida | **NECESARIA**; exigir cuerpo completo |
| Ordinal 23 del run alojado `0e77ffc8…` | Ledger: SCRIPT/NEXT_STATIC_SCRIPT, RSC/prefetch, DOM link UNKNOWN, RESPONSE 200 y NETWORK_CANCELLED | No registra actor del aborto ni consumo/recarga de ese recurso | **INDETERMINADA**; mantiene BLOCKED histórico |

## Contrato propuesto para revisión, no implementado

Toda petición **NECESARIA** exige origen fijado, intercepción CDP válida, respuesta y `Network.loadingFinished` del mismo ordinal, cuerpo íntegro y efecto funcional comprobado. Origen externo, rechazo CDP, fallo de red, correlación ambigua, evidencia contradictoria o petición necesaria/indeterminada cancelada o incompleta permanecen BLOCKED.

Una precarga cancelada solo podría recibir tratamiento auxiliar si el **mismo run** acredita iniciador y objetivo concretos, que su cuerpo no se consumió, un terminal correlacionado, sustitución por una petición necesaria completa y ausencia de pérdida en login, sesión, permisos y vistas con datos esperados. Cualquier campo ausente o `UNKNOWN` bloquea. Esta propuesta no cambia el gate actual ni autoriza reinterpretar ledgers anteriores. Para el ordinal 23 faltan vínculo con objetivo/DOM, acción que canceló, consumo o sustitución y comprobación de las vistas pertinentes en ese mismo run. Repetir una sonda sin esos discriminantes no resolvería la atribución.

## Limpieza y límites

El E2E retiró por propiedad siete cuentas y dos organizaciones en cada ejecución; una consulta SQL independiente posterior encontró 27 migraciones y cero Auth users, organizaciones, proyectos y membresías. Auditoría, resultados, imports, idempotencia y outbox total/pending también dieron cero. El stack se retira al cerrar el ensayo; su retirada se verifica por contenedores y directorio propios. H1-A permanece BLOCKED. U03/I-2/I-5 permanecen cerrados.
