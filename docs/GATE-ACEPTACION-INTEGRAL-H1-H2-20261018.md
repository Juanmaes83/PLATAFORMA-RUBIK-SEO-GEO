# Gate de aceptación integral · H1 y H2

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
