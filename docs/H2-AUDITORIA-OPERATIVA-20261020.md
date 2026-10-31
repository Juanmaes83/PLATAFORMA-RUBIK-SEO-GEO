# H2 · Auditoría operativa N1-07/N1-08

## CORTE DE PRIORIZACIÓN MVP · 31/10/2026

[Decisión y plan de cierre por riesgo 31/10](DECISION-MVP-RIESGO-Y-PLAN-CIERRE-20261031.md): **piloto controlado**, **H2 MVP comercial restringido** y **producto generalizado** son alcances distintos. No exigir la explicación forense histórica perfecta del XHR para planificar la aceptación funcional, pero tampoco sustituir los controles P0/P1, recuperación, datos personales, soporte y despliegue. Clasificar cada fila N1-07/N1-08 como probada, pendiente o excepción explícita con alcance/fecha/propietario. Para el corte #145 del 27/10, GitHub Actions tuvo una ejecución SUCCESS (`40510937115`, SHA `72bfbcd`); las frases inferiores «CI bloqueada por facturación» describen cortes históricos y **no invalidan ese run**, aunque un CI verde no acredita operación comercial. H1-A original, R1, U04, H1 y H2 siguen sin cierre. No ampliar funciones vendidas si faltan controles operativos. 


## Corte vigente · integración U03 · 22/10/2026

La [PR #143](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/143) está **MERGED** en `main@5cf2ad62605a1ed823771d28f32ca120797e57e7`; CI de PR `39737737422` SUCCESS. I-2/I-5/U03 están cerrados como gates alojados por el run `330c6e4b-14ad-439a-a8cf-43d92c73fadb`, con limpieza independiente. Se utilizó el mismo Preview existente, sin nuevo proyecto Supabase ni costes de proyecto adicional. La tabla y reconciliación inferiores preservan sus fechas y las referencias a #143 Draft, U03 BLOCKED, coste de un entorno nuevo, P-1 servidor pendiente y Actions sin jobs son históricas. H1-A NOT_RUN, U04/Sarah, H1 y H2 abiertos; R1 requiere decisión antes de Sarah. Vercel Production `dpl_6HyfzQ9iM3Buy6DEqLAKfEpTyFNL` quedó READY para el corte documental `5eec425ae3f3c31ce4c71a536c19c5d44aaa261f`, y `/api/salud` respondió 200 con el ref de Production; esto solo acredita el smoke de salud. Los restantes controles operativos N1-07/08 y la aceptación funcional tras release conservan sus gates propios.


Estado al 20/10/2026: **abierto; inventario documental, no certificación operativa**. La reconciliación del 22/10 al final de este documento prevalece para U03/P-1; las filas de esta tabla conservan el corte histórico. H2 depende de H1 completo y de la aceptación U04. Los checks locales, un deployment READY o una PR fusionada no prueban capacidad operativa real.

| Área | Estado conocido | Evidencia que falta / responsable |
|---|---|---|
| Invitaciones, alta y consentimiento | Parcial: roles/invitaciones V-1/V-2/V-3 pasaron en run `4fe31225-3194-4913-a7dc-319c0fe88cf1` | Reconciliar registro cerrado, invitación/revocación y política de consentimiento en el alcance H2; propietario y revisión de producto |
| Correo transaccional | No acreditado en este corte | Proveedor, dominio autenticado, entrega/rebote/abuso y recuperación; Juanma debe autorizar proveedor y costo antes de operación |
| Soporte e incidentes | No acreditado como operación sostenida | Canal, horarios/SLA, escalado, severidad, responsables y ejercicio de incidente; Juanma |
| Recuperación y copias | Parcial, evidencias históricas de restauración acotada no equivalen a recuperación integral actual | Backup reciente, retención, restauración completa y RTO/RPO medidos en anillo aislado; responsable operativo |
| Retención y borrado | Parcial | Política aprobada, inventario de datos/FK, borrado verificable y evidencia de retención; propietario y privacidad |
| Costes y límites | No acreditado para el rollout | Presupuesto, alertas, topes y costo del entorno alojado desechable para I-2/I-5; Juanma |
| Seguridad | Parcial | U03 alojado pasó el 22/10; restan revisión de amenazas/secretos, accesos mínimos y respuesta, además de integrar #143 tras auditar su HEAD; revisión técnica |
| Despliegue | No equivale a aceptación funcional | Rollback, configuración por entorno, protección Vercel y smoke tras release; responsable de despliegue |
| CI | Bloqueada por facturación de GitHub Actions | Reactivar facturación o aprobar una excepción de release explícita; no declarar Actions verde |
| Soporte de proveedores | El navegador P-1 y P-2 tienen evidencia previa; la salida de servidor P-1 aún requiere contador/logs del deployment instrumentado | Confirmar cero intentos/cero llamadas en ventana acotada; responsable técnico |

## Condiciones de cierre

1. H1-A integral y H1-B con aceptación explícita de Sarah completados.
2. U02/U03 y sus limpiezas acreditadas con entornos/SHA/ledger correctos.
3. Resolver cada fila pendiente con evidencia operativa o una decisión de excepción aprobada por Juanma, con alcance y fecha.
4. Registrar costos/configuración autorizados y revisar rollback antes de habilitar funciones o ampliar usuarios.

No ejecutar cambios de proveedor, correo, registro, políticas de retención o producción desde este inventario. Cada operación requiere alcance y evidencia propios.

## Reconciliación · 22/10/2026

- **U03 ya no bloquea H2 como prueba:** I-2/I-5 y U03 cerraron el gate alojado en el run `330c6e4b-14ad-439a-a8cf-43d92c73fadb` de Preview `rhnnplewqsekrnaousyl`. [Matriz](U03-PREVIEW-MATRIZ-20261018.md) y [runbook](U03-I2-I5-H1A-VENTANA-20261020.md) separan el PASS, limpieza y límites. Su código continúa en la [PR #143](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/143) OPEN/Draft; la revisión, fusión y comprobación posterior son tareas de integración distintas.
- **P-1 servidor:** el run previo `6311c85c-5d97-4af4-9569-7336f2232222` dio PASS acotado en las dos rutas instrumentadas. No demuestra ausencia global de egreso de servidor. La fila P-1 de la tabla superior es histórica; revisar nuevas rutas o una activación de proveedores según su propio alcance.
- **H1-A sigue NOT_RUN; U04/Sarah, H1 y H2 siguen abiertos.** R1 debe resolverse antes de datos de Sarah. Las condiciones operativas N1-07/08 de la tabla requieren evidencia o excepción explícita por fila; un PASS U03 no las cierra. GitHub Actions continúa bloqueada por facturación.
