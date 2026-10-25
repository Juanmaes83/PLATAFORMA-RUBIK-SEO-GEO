# Gate de aceptación integral · H1 y H2

## Corte vigente H1-A tras 9570e8d0 · 23/10/2026

El run alojado `9570e8d0-0c45-432a-b300-2c51d0c3ef58` conserva **BLOCKED** en `H1A_AUTH_LOGIN`: tres subrecursos del origen fijado fallaron en `Fetch.continueRequest`; otros tres registros corresponden al intento posterior de bloqueo. El ledger no conserva la clase del rechazo CDP y el snapshot `after-login` no demuestra login completo. Una lectura independiente **nueva** confirmó inventario/outbox/capacidades temporales a cero, guarda restaurada y escritor general NOLOGIN; las variables, deployment y vault ya no están. [Expediente y hashes](H1A-CDP-9570-20261023.md). La instrumentación añadida conserva categorías cerradas para un fallo futuro, pero no constituye una corrección funcional ni PASS alojado. U03 permanece cerrado; H1-A, R1, H1-B/U04, H1 global y H2 siguen abiertos.

## Corte H1-A tras e4296f43 · 23/10/2026

El run alojado `e4296f43-338a-4ca2-9f8f-340ac7f0c50a` conserva resultado **BLOCKED** en login por `H1A_PINNED_REQUEST_INTERCEPTION_FAILED`, antes de exportación HTTP. La lectura final independiente confirmó Preview e inventario/outbox a cero y principal temporal retirado. La operación CDP concreta no quedó en el ledger original; [el expediente acotado](H1A-CDP-E429-20261023.md) distingue lo acreditado de la reproducción local y documenta la corrección de categorías del ledger y del teardown. H1-A sigue abierto y la aceptación visual humana no se infiere de capturas anteriores.

## Estado histórico de H1-A tras c594d41d

H1-A continúa **BLOCKED**: el run alojado `c594d41d-dc26-4870-a4b4-3ec9fc2256ae` pasó login, permisos, datos firmados, aislamiento y cuatro vistas/capturas, pero export HTTP respondió 503; verificación y restauración no se ejecutaron. La limpieza y la lectura independiente dieron inventario/outbox/capacidades temporales cero. Una condición necesaria faltó en la ventana: la atestación del corte N1 para exportar v2. El código ahora la exige en el lote y en la atestación protegida y clasifica un 503 posterior con categoría cerrada. El ensayo local `aa8602bd-6957-4f81-9d88-56bfe151d255` pasó export HTTP, verificación, rechazo de manipulación, restauración doble y limpieza; no cierra H1-A alojado. U03 permanece PASS; R1, H1-B/U04, H1 global y H2 siguen abiertos. [Expediente](H1A-EXPORT-503-C594-20261023.md).

## Estado vigente de H1-A tras d3bb7af4

El run alojado `d3bb7af4-fa3c-49f0-98af-742158444963` se bloqueo en el intervalo `after-login`, antes de completar vistas, exportacion y restauracion. La limpieza independiente de Preview termino a cero. Los 132 errores de consola y 132 respuestas 404 originales carecen de clasificacion de recurso; la causa exacta sigue sin atribuir. El ensayo local completo con CDP y dos stacks paso, pero H1-A sigue BLOCKED hasta una campana alojada completa y aceptacion visual humana. [Diagnostico y evidencia](H1A-DIAGNOSTICO-D3BB-20261022.md). U03 conserva su PASS; R1, U04/H1-B, H1 global y H2 permanecen abiertos.

## H1-A · login normal y nueva prueba local · 23/10/2026

El run alojado `d3bb7af4-fa3c-49f0-98af-742158444963` conserva BLOCKED y su limpieza acreditada. El defecto actual se reprodujo de forma segura sin fixtures: clic con Server Action seguido de 404 de assets inmutables; envio nativo del mismo formulario con HTTP 303 y cero errores. El login se cambio a POST de documento con Auth del servidor, comprobacion de origen y redireccion relativa. El run local `d1a93948-00dc-4e8b-ad3b-83b8b16504ae` paso el recorrido completo con dos stacks desechables y limpieza. La sonda protegida sin fixtures en `dpl_HnUY7E1B8rLGzLZtUtvfwHEZvkbM` / SHA `029db301498b8134a70eb6f0ed6aa5a3d07a3388` paso el login negativo con 303, cero 404 y cero errores. Falta una unica campana integral alojada y revision visual humana. H1-A sigue BLOCKED; H1-B/U04 con Sarah, R1, H1 global y H2 permanecen abiertos.

## H1-A · snapshots acumulativos locales · 22/10/2026

El run local `1c37450a-5cbb-4bad-8c91-6a92d9a24491` registra snapshots acumulativos no consumibles antes y después de login, navegación y medición. El verificador comprueba los 18 límites esperados entre cuatro gates visuales (desktop/móvil, medición/informe), valida mapas cerrados, continuidad before/after, deltas recalculados y suma exacta contra cada contador del gate. Un límite ausente, una discrepancia o cualquier dato fuera del esquema bloquea la evidencia. Los cuatro gates visuales locales reportaron cero errores de consola/página; exportación HTTP loopback, verificación offline, rechazo de manipulación, restauración doble e idempotente y limpieza de ambos stacks pasaron. La prueba de integración vuelve a leer y validar el ledger persistido.

Este es un PASS local, no evidencia alojada. No se ha preparado ni abierto una ventana H1-A nueva en Preview en este corte. H1-A permanece BLOCKED hasta superar preflights alojados, una sola campaña integral, lectura independiente de limpieza y revisión visual humana. R1, H1-B/U04, H1 global y H2 siguen abiertos.

## Corte H1-A · 22/10/2026 · recuperación y ensayo local

El run alojado `f7ee4d0a-edb4-4276-88fc-03bbab570a19` conserva su resultado **BLOCKED**. Su recuperación posterior pasó y una lectura independiente confirmó Preview a cero, guarda restaurada y capacidades temporales retiradas. El fallo `H1A_EXTERNAL_NAVIGATION_BLOCKED` histórico no identifica el tipo de petición; un defecto reproducido localmente confundía redirecciones de recursos secundarios con navegación principal. El arnés ahora bloquea ambas salidas, pero solo la navegación principal falla ese gate, y registra categorías cerradas. Véase [expediente de recuperación](H1A-RECUPERACION-F7EE-20261022.md).

Un recorrido local nuevo con dos stacks N1 desechables pasó Auth, vistas desktop/móvil, exportación HTTP real, verificación y rechazo de manipulación, restauración doble, logout y limpieza. Esta evidencia local no cierra H1-A: faltan deployment protegido del SHA funcional, preflights alojados, una campaña nueva única y aceptación visual humana. R1, H1-B/U04 con Sarah, H1 global y H2 siguen abiertos.

## Actualización de pasada A · 22/10/2026

La evidencia local integrada del run `d6bc8e22-a761-4d68-823a-d7827b2acc6f` pasó exportación HTTP loopback, verificación, rechazo de manipulación, restauración doble en destino separado y limpieza; véase `docs/evidence/H1A-LOCAL-HTTP-RESTORE-20261022.jsonl`. No satisface la fila de pasada A, que exige Preview alojado y evidencia visual asociada al mismo run. H1-A alojado permanece NOT_RUN. U03 PASS del run `330c6e4b-14ad-439a-a8cf-43d92c73fadb` se reutiliza. R1 (consistencia frente a escrituras concurrentes) sigue pendiente para datos reales/Sarah; en esta prueba ficticia no hubo escrituras concurrentes y no se afirma snapshot transaccional. H1-B/U04, aceptación humana de Sarah, H1 y H2 siguen abiertos.

Fecha de incorporación: 18/10/2026. Estado: **PENDIENTE DE EJECUCIÓN**. Este protocolo concreta el criterio de terminado del [Roadmap Maestro](ROADMAP-MAESTRO-2026.md) y del [estado de los tres niveles](ESTADO-TRES-NIVELES-Y-CIERRE-20261018.md). Los tests de componentes, la matriz U03, el despliegue READY y una demostración visual aislada no sustituyen este recorrido.

## Objetivo y alcance

Comprobar que Rubik SEO/GEO permite realizar una tarea útil de principio a fin en alojado, con identidad, permisos, fuentes, resultado, exportación y recuperación verificables. El gate tiene **dos pasadas obligatorias**. La primera usa identidades y datos ficticios propios; la segunda es la aceptación controlada del piloto Sarah Katerina (U04). H1 exige ambas pasadas y la evidencia técnica requerida. H2 exige H1 y además sus controles multicliente y condiciones operativas/comerciales. Ningún PASS parcial se presenta como cierre de H1 o H2.

| Pasada | Recorrido | Resultado exigido |
|---|---|---|
| **A. Ensayo ficticio alojado** | Entrar con una cuenta real de prueba → crear organización y proyecto → asignar y retirar permisos → incorporar datos autorizados → consultar medición e informe → exportar, verificar y restaurar → cerrar sesión y limpiar | Flujo completo, errores y tiempos registrados; exportación verificable y limpieza acreditada |
| **B. Piloto Sarah · U04** | Juanma y Sarah recorren los casos de uso acordados con sus datos y accesos autorizados | Resultado útil para Sarah, incidencias resueltas o aceptadas y aprobación humana documentada |

## Secuencia única para cerrar el Nivel 1

1. **#129 / U02:** reconciliar la PR con `main`, auditar el HEAD exacto, comprobar el aislamiento y fusionar el código aprobado. El merge no acredita U03 ni autoriza SQL N2 o proveedores.
2. **U03 esencial:** completar los negativos y positivos de actores, invitación/consentimiento/retirada y JWT aún válido, más B-4 en Preview protegido. El resultado Data API de tres actores (12/12 reportados por el propietario) es parcial. No volver a ejecutar esos casos salvo cambio que los afecte.
3. **Pasada A:** una sola campaña identificada por `runId`, con libro de fixtures y checkpoints por paso. La parte Auth/UI y RLS se ejecuta en Preview aislado `rhnnplewqsekrnaousyl`. La exportación firmada y el escritor **no se habilitan en Preview por conveniencia**: su subensayo se hace solo en el entorno alojado expresamente autorizado, con el proyecto ficticio y el anillo adecuado. Se documenta la frontera entre entornos; no se simula que un recorrido continuo por un único entorno quedó probado si no fue así.
4. Resolver los fallos reproducidos del recorrido y repetir solo los pasos afectados más sus dependencias. Conservar el primer FAIL y el PASS posterior en el expediente.
5. **Pasada B / U04:** después de acordar R1, retención/autoría y alcance de datos/proveedores, Juanma autoriza la ventana Sarah. Juanma y Sarah recorren y aceptan el resultado; Codex recoge evidencias técnicas sin publicar datos ni credenciales.
6. Registrar la decisión H1. Para H2, añadir la aceptación multicliente y operación N1-07/08: hosting, registro/invitaciones, SMTP, soporte, incidentes, backups, gasto, retención, seguridad y CI o su excepción aprobada. N2 alojado tiene un gate propio y no se presume activo por estar fusionado en `main`.

## Pasada A · Guion y criterios

| Fase | Evidencia mínima | Criterio de salida |
|---|---|---|
| Preflight | SHA/deployment, ref explícito, migraciones, flags, protección, cuentas ficticias, respaldo/plan de contención y ledger vacío | Destino correcto y capacidades necesarias acreditadas; si faltan, detener antes de crear fixtures |
| Acceso y alta | Login mediante Auth auténtico, sesión/cookie, organización A y proyecto A1 creados desde el flujo permitido; registrar si algún alta requiere preparación administrativa | Identidad y propiedad verificadas, sin usar Production como Preview |
| Multicliente | A2 y B1, roles autorizados, invitación/consentimiento y retirada; negativos entre organizaciones y proyectos, token todavía válido tras retirada | Sin lectura, escritura ni revelación de existencia cruzada |
| Datos y utilidad | Introducir solo datos ficticios o autorizados con fuente/fecha; consultar medición e informe en escritorio y móvil; registrar secciones sin datos o apagadas | La pantalla presenta datos y límites fieles; no inventa resultados, rangos ni firmas |
| Exportación y recuperación | Solicitud HTTP con sesión legítima al endpoint real, artefacto firmado, verificación fuera de línea, manipulación rechazada, restauración dos veces en destino aislado y reexportación/identidad comparadas | Firma, contenido, idempotencia y límites de cobertura acreditados; resolver R1 antes de usar datos reales |
| Salida y limpieza | Logout; reconciliar todos los IDs del `runId`, eliminar solo fixtures propios y comprobar usuarios, organizaciones, proyectos, membresías y outbox pendiente | Cero residuos propios y cero recibos pendientes; cualquier limpieza ambigua se registra como FAIL |

Registrar para cada fase hora de inicio y fin, duración, actor, entorno, SHA, código HTTP/SQLSTATE sanitizado, resultado PASS/FAIL/SKIP, incidencia y vínculo a evidencia sin secretos. Si la UI no ofrece un paso, registrar el hueco y su ruta administrativa; no marcar como recorrido de usuario completo. Las secciones N2 apagadas se registran como «No disponible» y no se califican como funcionalidad alojada.

### B-4 protegido en Windows

Responsables: **Codex en Windows**, **Juanma para la entrada segura**, **ChatGPT para auditar resultados**. Antes de lanzar Chromium, comprobar en PowerShell autenticado si `vercel env run -e preview` entrega `VERCEL_OIDC_TOKEN` al proceso hijo y si Trusted Sources permite el deployment fijado. Registrar solo **presente/ausente** y resultado HTTP, nunca token, URL con credencial, encabezados sensibles ni cookies. El arnés debe fallar cerrado. No ejecutar B-4 hasta recrear A1/A2/B1 y cuentas ficticias propias con ledger y limpieza por IDs; el ensayo anterior terminó con cero fixtures. Después ejecutar escritorio y móvil y volver a comprobar cero residuos.

Si no se acredita OIDC/Trusted Sources, B-4 queda BLOCKED y se decide una vía protegida distinta de forma explícita; no retirar Vercel Authentication ni crear enlaces públicos para desbloquearlo.

## Pasada B · Aceptación Sarah (U04)

Antes de usar datos reales: autorización concreta de Juanma, alcance y permisos de Sarah, fuentes y proveedor permitidos, presupuesto, decisión R1 sobre consistencia, política de autoría/retención, respaldo utilizable y contención. Definir 2–3 tareas reales con Sarah (pregunta de negocio, dato de entrada y resultado esperado) antes de la sesión. En la sesión, Sarah accede con su identidad, completa las tareas, revisa medición/informe y confirma si entiende fuente, fecha y límites. La exportación y recuperación se ensayan conforme al acuerdo U04, sin usar sus datos como fixtures de U03.

El acta guarda: tareas completas/incompletas, incidencias y severidad, tiempo por tarea, evidencia enlazada con acceso restringido, decisión de Sarah (acepta, acepta con incidencias concretas o rechaza) y decisión final de Juanma. Una incidencia bloqueante no se convierte en aceptación por silencio. No publicar datos del cliente en GitHub.

## Evidencia, resultado y responsables

- **Codex:** preparar guion, arnés, preflight, ledger, ejecución técnica, limpieza y expediente con SHA/deployment/refs y límites. No abrir una nueva vertical ni repetir baterías sin riesgo nuevo.
- **ChatGPT:** auditar #129 y los resultados por fase, contrastar pruebas reportadas con evidencia disponible, supervisar merge y estado del Roadmap.
- **Juanma:** custodiar secretos en Windows; decidir R1, retención, entorno autorizado para exportación y U04; acordar tareas con Sarah y firmar aceptación H1/H2.
- **Sarah:** validar utilidad y comprensión del piloto en la pasada B.

El expediente final separa **PASS, FAIL, SKIP y NO EJECUTADO**. H1 solo puede marcarse CERRADO cuando la pasada A cubra exportación HTTP firmada y restauración/idempotencia, la pasada B sea aceptada y no queden incidencias bloqueantes. H2 solo puede marcarse CERRADO después de H1, U02/U03 y N1-07/08 aceptados. GitHub Actions bloqueado por facturación requiere resolución o excepción de release explícita del propietario; nunca se denomina CI verde.

## Regla permanente de informe por run H1-A

Antes de proponer otro paso, para cada run alojado, local, de CI o preparado, informar: (1) último gate PASS, caseId y evidencia; (2) primer FAIL/BLOCKED con fase, código y categoría, separado de cascadas; (3) gates NOT_RUN separados de FAIL; (4) efectos y limpieza de fixtures, recibos, outbox, rol, políticas, sesiones, guarda, variables, deployment y vault. Un entorno alojado exige lectura independiente además del ledger; un stack local exige verificar su retirada. (5) Separar causa demostrada de hipótesis y nunca reconstruir campos ausentes. (6) Corrección y prueba que fallaba antes y pasa después, o impedimento exacto y acción mínima. Identificar para cada afirmación si procede del ledger original, de una lectura independiente anterior o de una comprobación nueva. La regla se aplica aunque no se ejecute un nuevo run.

Para la sonda Auth/XHR, el gate sigue exigiendo `Network.loadingFinished` correlacionado para cada petición observada. El diagnóstico nuevo clasifica fase, script iniciador, señal RSC/prefetch, relación con enlaces del DOM y ausencia de terminal al vencimiento; `UNKNOWN`, cancelación y falta de terminal siguen bloqueando. El expediente `H1A-XHR-CAUSAL-20261025.md` separa esas categorías futuras de lo que acredita el ledger histórico `e610fc60…`. Un `document-title` ausente al ejecutar axe se sincroniza esperando el título real; el test conserva el rechazo si nunca aparece.
