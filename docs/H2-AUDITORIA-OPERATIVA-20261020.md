# H2 · Auditoría operativa N1-07/N1-08

Estado al 20/10/2026: **abierto; inventario documental, no certificación operativa**. H2 depende de H1 completo y de la aceptación U04. Los checks locales, un deployment READY o una PR fusionada no prueban capacidad operativa real.

| Área | Estado conocido | Evidencia que falta / responsable |
|---|---|---|
| Invitaciones, alta y consentimiento | Parcial: roles/invitaciones V-1/V-2/V-3 pasaron en run `4fe31225-3194-4913-a7dc-319c0fe88cf1` | Reconciliar registro cerrado, invitación/revocación y política de consentimiento en el alcance H2; propietario y revisión de producto |
| Correo transaccional | No acreditado en este corte | Proveedor, dominio autenticado, entrega/rebote/abuso y recuperación; Juanma debe autorizar proveedor y costo antes de operación |
| Soporte e incidentes | No acreditado como operación sostenida | Canal, horarios/SLA, escalado, severidad, responsables y ejercicio de incidente; Juanma |
| Recuperación y copias | Parcial, evidencias históricas de restauración acotada no equivalen a recuperación integral actual | Backup reciente, retención, restauración completa y RTO/RPO medidos en anillo aislado; responsable operativo |
| Retención y borrado | Parcial | Política aprobada, inventario de datos/FK, borrado verificable y evidencia de retención; propietario y privacidad |
| Costes y límites | No acreditado para el rollout | Presupuesto, alertas, topes y costo del entorno alojado desechable para I-2/I-5; Juanma |
| Seguridad | Parcial | Completar U03, revisión de amenazas/secretos, accesos mínimos y respuesta; revisión técnica |
| Despliegue | No equivale a aceptación funcional | Rollback, configuración por entorno, protección Vercel y smoke tras release; responsable de despliegue |
| CI | Bloqueada por facturación de GitHub Actions | Reactivar facturación o aprobar una excepción de release explícita; no declarar Actions verde |
| Soporte de proveedores | El navegador P-1 y P-2 tienen evidencia previa; la salida de servidor P-1 aún requiere contador/logs del deployment instrumentado | Confirmar cero intentos/cero llamadas en ventana acotada; responsable técnico |

## Condiciones de cierre

1. H1-A integral y H1-B con aceptación explícita de Sarah completados.
2. U02/U03 y sus limpiezas acreditadas con entornos/SHA/ledger correctos.
3. Resolver cada fila pendiente con evidencia operativa o una decisión de excepción aprobada por Juanma, con alcance y fecha.
4. Registrar costos/configuración autorizados y revisar rollback antes de habilitar funciones o ampliar usuarios.

No ejecutar cambios de proveedor, correo, registro, políticas de retención o producción desde este inventario. Cada operación requiere alcance y evidencia propios.
