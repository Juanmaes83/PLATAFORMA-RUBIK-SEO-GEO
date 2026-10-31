# U04 · Paquete de aceptación con Sarah

## Nuevo enfoque de aceptación del MVP · 31/10/2026

Antes de preparar la ventana real de Sarah, leer la [decisión MVP por riesgo del 31/10](DECISION-MVP-RIESGO-Y-PLAN-CIERRE-20261031.md). La nueva estrategia **reduce la investigación forense XHR**, no los requisitos de autorización/consentimiento, seguridad, fuentes, recuperación y utilidad. U04 sigue **NO EJECUTADA**. El nuevo contrato `MVP_FUNCTIONAL_ACCEPTANCE` necesita ratificación formal antes de sustituir exigencias del gate anterior. Para R1 sigue sin haber elección: `R1-SNAPSHOT` o `R1-PILOTO-QUIETO` (solo si se demuestra barrera real de escrituras o detección/aborto; comparar recuentos no basta). No usar datos reales ni solicitar aceptación a Sarah hasta que el alcance y sus controles estén aprobados. El resto del documento mantiene la pauta histórica de la sesión.


Estado: **PREPARACIÓN DOCUMENTAL; sesión y aceptación no ejecutadas**. Usar solo después de que U03 y H1-A tengan evidencia suficiente, Juanma autorice el alcance concreto y Sarah consienta accesos, fuentes y tratamiento de datos. No guardar datos del cliente ni credenciales en este expediente o GitHub.

## Decisión previa R1

La exportación actual enumera las superficies y compara recuentos antes/después. Esos controles detectan cambios de cantidad, pero no forman una instantánea transaccional: escrituras concurrentes que mantengan el mismo recuento podrían producir una exportación mezclada. Antes de Sarah, Juanma debe elegir:

1. **Exigir snapshot consistente:** bloquear el uso con datos de Sarah hasta disponer de una transacción/snapshot de exportación verificable y pruebas de concurrencia; o
2. **Aceptar el límite actual para el piloto:** permitir solo una ventana sin escrituras concurrentes, explicando a Sarah el alcance y tratando cualquier concurrencia detectada como abortar y reintentar.

No se asume ninguna de estas decisiones por el propietario. La segunda opción no convierte el export actual en snapshot transaccional.

## Tareas candidatas (confirmar con Sarah antes de la sesión)

| Tarea | Entrada autorizada | Resultado esperado | Evidencia a revisar |
|---|---|---|---|
| 1. Revisar un proyecto y sus fuentes | Dominio/proyecto que Sarah autorice expresamente | Identificar configuración, fecha y cobertura visible; distinguir datos ausentes de errores | Captura saneada y observación de comprensión |
| 2. Interpretar informe/medición | Proyecto y fuentes consentidos; sin activar proveedores no autorizados | Responder una pregunta de negocio acordada usando solo resultados etiquetados y sus límites | Respuesta de Sarah, fuente/fecha citadas y límites entendidos |
| 3. Exportar o recuperar, si procede | Solo datos dentro del alcance acordado y con R1 resuelto | Descargar/verificar artefacto y explicar restauración dentro del entorno autorizado | Resultado técnico y comprensión; no copiar el artefacto a GitHub |

Si Sarah no autoriza fuentes/proveedores o el entorno no tiene los datos acordados, omitir la tarea y registrar el motivo; no producir resultados ficticios como sustituto del piloto real.

## Registro breve de sesión (rellenar durante la sesión)

- Fecha, deployment/SHA, participantes y consentimiento: ____
- Proyecto/fuentes autorizados (referencias internas, sin datos sensibles): ____
- R1 decidido por Juanma y condición aplicada: ____
- Tarea 1/2/3: completada / incompleta / omitida; duración; esperado vs. observado; incidencia y severidad: ____
- ¿Sarah identificó fuente, fecha y límites del resultado?: sí / parcialmente / no; detalle: ____
- Resultado de Sarah: acepta / acepta con incidencias listadas / rechaza / no concluyente: ____
- Incidencias bloqueantes y responsable/fecha: ____
- Decisión final de Juanma: ____

Una respuesta en blanco, una tarea demostrada por Codex o una señal visual no constituye aceptación. H1-B requiere la decisión explícita de Sarah y resolución/aceptación explícita de incidencias bloqueantes.
