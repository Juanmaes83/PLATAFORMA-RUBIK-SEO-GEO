# H1-A: experimento local de cancelación XHR tras HTTP 200

SHA base: `5a0ef46a6c2d839ed67d95f94194ab27c7ba6efc`. No se ejecutó ninguna sonda alojada. El ledger histórico del run `0e77ffc8-f58b-4698-a8ac-905438b1486f` permanece intacto y su SHA-256 es `256EE421EDF066A4AC2D7FE5B0B560823AA9A65803C39E78F1ADA5D3A28F1454`.

La prueba `scripts/h1a-xhr-cancellation-experiment.test.mjs` usa Chromium real y el interceptor `installScopedRoutes`. Los tres casos comparten servidor local, frame, script Next ficticio, XHR RSC/prefetch y respuesta HTTP 200 parcial. Esperan la lectura del primer fragmento y el evento `Network.responseReceived` del mismo XHR antes de variar solo la acción. Los identificadores CDP se correlacionan exclusivamente en memoria. La ventana posterior es de 350 ms. Las pruebas comprueban que el gate bloquea y que el trace carece de URL, cabeceras, cookies, IDs CDP y texto libre.

| Acción | Orden posterior a HTTP 200 | Ocho repeticiones | Resultado |
| --- | --- | --- | --- |
| A: AbortController, sin navegación | ACTION → pausa Fetch → NETWORK_CANCELLED | 8/8 canceladas; ningún evento de frame o cierre | BLOCKED 8/8 |
| B: desmontaje del mismo frame | ACTION → pausa Fetch → NETWORK_CANCELLED → FRAME_DETACHED | 8/8 canceladas y frame detached. En la primera serie de tres, el código global varió: un `XHR_INTERCEPTION_BLOCKED` y dos `XHR_TERMINAL_UNVERIFIED` | BLOCKED 8/8 |
| C: cierre de página | ACTION → PAGE_CLOSED | 8/8 sin terminal de red observado; terminal `UNKNOWN` | BLOCKED 8/8 |

La secuencia de red por sí sola no distingue A y B: ambas terminaron en `NETWORK_CANCELLED` después de HTTP 200. `FRAME_DETACHED` distingue el contexto B en este experimento, pero ocurrió después del terminal y no acredita que causara el aborto. El código global de B también mostró una carrera entre series. C deja una petición sin terminal observado, nunca un PASS. Estos resultados no atribuyen la causa del ordinal alojado 23. Para afirmar que la aplicación abortó hace falta instrumentar la llamada de aborto y vincularla inequívocamente con la petición del mismo run. Para atribuir el desmontaje se necesita una relación causal, no proximidad temporal. En ausencia de esas pruebas la causa sigue `UNKNOWN` y el gate sigue bloqueado.

La prueba cierra navegador y servidor local en `finally`; no crea base, fixtures, rol, variables, vault ni deployment. U03/I-2/I-5 permanecen cerrados. H1-A, su recorrido integral y la aceptación visual siguen pendientes.
