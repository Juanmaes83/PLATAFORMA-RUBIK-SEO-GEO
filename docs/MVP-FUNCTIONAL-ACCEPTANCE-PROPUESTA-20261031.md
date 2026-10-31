# Propuesta revisable · aceptación funcional del MVP y decisión R1

**Fecha:** 31/10/2026. **Estado:** propuesta técnica, pendiente de ratificación de Juanma. **Base documental:** `main@ba21a08033e58d0808dd74189edbcdc989f82dbb` (#153). **Rama de producto en revisión:** [#145](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/145) `72bfbcdffa332c11b2e00a62692e301a22f507fe`, Draft. Este expediente no altera el [gate original](GATE-ACEPTACION-INTEGRAL-H1-H2-20261018.md), no declara H1-A/H1/H2 cerrados y no autoriza una ventana alojada.

## Reconciliación y siguiente decisión

| Gate | Última evidencia y estado | Falta / riesgo | Acción mínima y responsable |
| --- | --- | --- | --- |
| U03 | **PASS alojado**, run `330c6e4b-14ad-439a-a8cf-43d92c73fadb`, [matriz](U03-PREVIEW-MATRIZ-20261018.md); #143 fusionada | Revalidar solo dependencias afectadas por cambios de versión o entorno | Codex compara diff y alcance; no repetir toda la campaña sin causa |
| H1-A original | **BLOCKED/INCOMPLETA**: XHR histórico con terminal cancelado; pasos posteriores NOT_RUN. [Ensayo poblado](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/blob/codex/h1a-integral-20261022/docs/H1A-XHR-POPULATED-LOCAL-20261027.md) A mostró medición firmada, B no acreditó sustitución (`directFinished=0`) | Solicitud necesaria/indeterminada incompleta no recibe PASS; no se infiere inocuidad del ordinal 23 | Conservar ledger y gate; reabrir forénsica solo ante defecto P0/P1 o discriminante decisivo |
| H1-A funcional candidato | **NOT_RUN completo**; protocolo aún sin ratificar | Faltan recorrido alojado ficticio, datos poblados, export/restore y resultado por fase | Juanma ratifica contrato; Codex prepara y ejecuta **una** ventana autorizada tras preflight |
| R1 | **PENDIENTE**; export actual no ofrece snapshot transaccional | Mezcla de versiones con escritura concurrente de igual recuento: **P0 para datos reales en export/restore** | Codex prueba mecanismo; Juanma elige alternativa con evidencia antes de Sarah |
| U04/Sarah | **NOT_RUN**; [paquete](U04-PAQUETE-ACEPTACION-20261020.md) preparado | Consentimiento, fuentes, entorno, R1, respaldo y aceptación humana | Juanma y Sarah acuerdan 3 tareas y autorizan ventana; Codex registra resultados |
| H1 | **ABIERTO** | Pasadas aplicables A y B, recuperación y acta | Juanma decide alcance y acepta después de evidencia, no por CI |
| H2 restringido | **ABIERTO**; [auditoría](H2-AUDITORIA-OPERATIVA-20261020.md) parcial | N1-07/08, políticas de operación y release; ningún P0/P1 en funciones vendidas | Codex aporta pruebas/runbooks; Juanma aprueba controles y excepciones acotadas |

GitHub al 31/10: `main@ba21a080` incorpora #153; #145 permanece Draft en `72bfbcd`, base `3a735510` y GitHub la marca `CONFLICTING` con `main` actual. #147 y #148 se fusionaron **dentro de #145**. [CI #145](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/40510937115) fue SUCCESS en ese HEAD (Node 22, Node 24, E2E local); no acredita aceptación alojada ni compatibilidad con el nuevo `main`. La integración de #153 en #145 corresponde al propietario de esa PR y requiere resolver el conflicto y repetir checks del nuevo SHA.

## Evidencia local nueva, limitada y reproducible

En este corte documental desde `main@ba21a080`, `npm run verify` pasó: pin Core, escaneo de secretos **778 archivos**, lint, tipos, Vitest **638 PASS / 1 SKIP** (76 archivos) y build Next 16.3.8. No se ejecutaron aquí pgTAP, suite completa de integración, E2E, ni campaña alojada. El resultado local no se atribuye al HEAD de #145.

El intento `npm run test:u03-http-restore` se detuvo con `LOCAL_HTTP_RESTORE_REFUSES_PREEXISTING_STACK` porque ya existía `rubik-u03-window-20261020`, ajeno a esta ejecución. No se tocó ese stack. Un primer intento de `restore.integration.test.ts` sobre el Supabase compartido, aunque confirmado en `127.0.0.1:54321`/`:54322`, falló antes de sus casos: solo tenía **17 migraciones** y faltaba `private.audit_outbox`; el `afterAll` dejó dos usuarios/organizaciones propios. Se retiraron en transacción por IDs y sufijo exactos, con comprobación de propiedad y lectura final `0|0`. Resultado: **suite FAIL, 10 SKIP**, no evidencia funcional.

Se creó después un stack **propio** `rubik-u03-i5-20261022`, API `127.0.0.1:64521`, DB `127.0.0.1:64522`, **27/27 migraciones** hasta `20261015210000`. La primera invocación de la prueba sin `RUBIK_AUDIT_DATABASE_URL` falló en setup (`appendAudit`), **10 SKIP**; su `afterAll` sí retiró sus fixtures (usuarios, organizaciones y outbox = 0). Tras configurar un rol `LOGIN NOINHERIT` temporal con `SET ROLE rubik_audit_writer` solo en ese stack y credencial efímera en el proceso, `tests/integration/restore.integration.test.ts` pasó **10/10**. Cubre export firmado, verificación, restauración e idempotencia/rollback según el archivo de test; no es el GET HTTP real ni un snapshot R1. El rol se revocó y eliminó; lectura independiente final: usuarios, organizaciones, proyectos, auditoría, resultados, imports, outbox y roles `u03_mvp_%` = `0|0|0|0|0|0|0|0`. El stack propio se retiró: contenedores 0 y workdir eliminado. Los dos FAIL iniciales permanecen registrados; no se reinterpretan como PASS.

## Contrato propuesto `MVP_FUNCTIONAL_ACCEPTANCE`

Registrar por fase `PASS`, `FAIL`, `BLOCKED`, `PARTIAL` o `NOT_RUN`, con runId, actor, proyecto, origen, deployment/SHA, horario, respuesta/efecto, evidencia saneada y limpieza. `PARTIAL` no cierra ningún gate. La ratificación debe fijar el alcance de sustitución respecto del gate H1-A original y aceptar expresamente la deuda forense P2; hasta entonces son expedientes independientes.

1. **Preflight de una sola ventana alojada ficticia:** SHA y deployment exactos, ref Supabase, migraciones, flags, protección, credenciales solo en memoria, anillo de firma, inventario inicial, contención y backup. Separar las fronteras Auth/Preview y export/restore si usan entornos distintos; no presentar continuidad no probada.
2. **Acceso y permisos:** login POST 303, sesión, panel y proyecto propio, logout y revocación con JWT aún válido. A1/A2/B1, rol y consentimiento; lectura y escritura de otro proyecto/organización, IDs ausentes y actor sin membresía denegados sin revelar existencia. Reutilizar U03 solo donde SHA, entorno y control sigan equivalentes.
3. **Dato útil poblado:** una captura o resultado ficticio firmado por flujo legítimo; fuente, fecha, cobertura, identidad y proyecto visibles; medición e informe coherentes en escritorio y móvil. Ausencia explícita, nunca cero inventado. Comprobar datos y respuesta íntegra de la solicitud necesaria, además de UI.
4. **Exportación y restauración:** GET autenticado real; manifiesto y firmas verificadas fuera de línea, manipulación rechazada, restauración en destino aislado **dos veces** sin duplicados, igualdad de identidad/contenido/procedencia y exclusiones declaradas. Si falla recuperación o se desconoce la completitud, `FAIL/BLOCKED`, nunca PASS. Para datos reales, R1 decidido y demostrado antes de este paso.
5. **Seguridad y salida:** ninguna llamada externa o proveedor de pago no aprobado, presupuesto fail-closed, RLS/permisos, recibos/auditoría y firma válidos, sin secretos en evidencias. Limpieza por runId/IDs propios, lectura independiente final y cero outbox/residuos; no borrar fixtures ajenos.
6. **Calidad mínima:** los flujos comprometidos deben poder entenderse y completarse en escritorio y móvil con errores útiles y accesibilidad básica. Una pantalla renderizada sin datos ni efecto comprobado no satisface el gate.

**NO-GO:** cualquier P0 de identidad, aislamiento, firma, integridad, recuperación necesaria, egreso o coste no autorizado; cualquier P1 que impida una tarea comprometida; petición actual necesaria o de impacto desconocido sin terminal/cuerpo íntegro; evidencia crítica faltante o limpieza insegura. Un P1 de función prescindible solo puede excluirse mediante decisión de alcance explícita con aislamiento probado. El XHR histórico permanece `BLOCKED` en su expediente; si no aparece defecto funcional P0/P1, su investigación puede quedar como P2 con responsable, condición de reapertura y fecha de revisión **solo por aceptación expresa de Juanma**.

## R1 · garantía técnica antes de datos reales

En `src/lib/provenance/repository.ts`, `readCompleteRows` compara **recuentos** antes y después de paginar. La ruta HTTP lee auditoría/resultados/imports por llamadas separadas, luego estado operativo, SEO/Contenido/GEO, esquema y outbox. SEO y Contenido/GEO se leen dos veces, pero no existe una transacción común para todas las superficies. El outbox bloquea recibos pendientes y compara `total`, no un epoch de toda escritura del proyecto. Una modificación o sustitución entre páginas/consultas que conserve recuentos puede producir mezcla de versiones; el manifiesto firmaría esa mezcla. Las pruebas actuales comprueban cambio de recuento/página ausente y outbox nuevo, **no** una escritura concurrente de igual cardinalidad en varias superficies.

**Recomendación técnica: R1-SNAPSHOT como opción de referencia.** Implementar lectura consistente de todas las superficies incluidas bajo una instantánea transaccional con alcance de proyecto, preservar RLS/privilegios mínimos, firmar después de verificar la lectura y ensayar escrituras concurrentes (UPDATE, DELETE+INSERT de mismo recuento, nuevas filas en distintas tablas, outbox) y restauración doble. La API actual realiza llamadas PostgREST independientes; requiere diseño/implementación nueva para garantizar esa transacción. No etiquetar el export actual como snapshot.

**R1-PILOTO-QUIETO** solo sería admisible si se implementa una barrera efectiva para **todos** los escritores del proyecto o un epoch transaccional común que detecte y aborte cualquier escritura durante el export, incluidos flujos administrativos y outbox. Una promesa operativa de no escribir y la comparación de recuentos actuales no lo demuestran. Hasta entonces esta alternativa no está técnicamente disponible y no se recomienda para datos de Sarah. Juanma decide tras revisar costes/alcance y pruebas; ninguna elección se infiere de este documento.

## Paquete mínimo U04 y H2

**U04:** acordar con Sarah (1) entrar y reconocer proyecto, fuentes, fechas y cobertura; (2) responder una pregunta SEO/GEO real usando un único resultado autorizado, señalando límites; (3) consultar informe y explicar siguiente paso, incluyendo export/verificación solo si el alcance y R1 lo permiten. Registrar consentimiento, objetivo, tiempo, esperado/observado, incidencias y severidad, comprensión y decisión explícita de Sarah y Juanma. No usar datos reales para ensayos previos.

| H2 restringido | Mínimo antes de vender | Decisión/limitación posible |
| --- | --- | --- |
| Invitación/consentimiento y aislamiento | Alta cerrada, rol/revocación con JWT válido, negativos multi-tenant; U03 reutilizable donde aplique | Sin autoservicio si el flujo manual auditado funciona |
| Correo transaccional | Entrega/rebote/abuso y recuperación para flujos activos | Si no existe, operar invitaciones manualmente y no prometer autoservicio; Juanma aprueba proceso |
| Soporte/incidentes | Canal, responsable, horario, severidad, escalado y ejercicio | SLA limitado declarado y aceptado |
| Backups/restore | Copia reciente portable, cobertura, restauración aislada, RTO/RPO medidos y R1 | Sin prueba de recuperación de datos vendidos, NO-GO |
| Retención/borrado | Política aprobada, autoría/FK, solicitud de borrado y comprobación | Plazos y excepciones requieren decisión de Juanma |
| Gasto/proveedores | Topes/alertas y egress bloqueado por defecto | Vender solo funciones sin proveedores activos si los controles no están acreditados |
| Deploy/seguridad/CI | SHA exacto, protección, rollback y smoke, secretos/roles mínimos, revisión de cambios; CI o excepción formal | READY no equivale a prueba funcional; excepción de release documentada por Juanma |

El piloto controlado, H2 restringido y SaaS generalizado requieren actas diferentes. Agency Operations (#152) y GEO Citation Lab (#149) siguen en roadmap aditivo; no son requisito del primer MVP. **Siguiente acción exacta:** ratificar o corregir este contrato y su umbral residual, luego preparar el preflight de una sola ventana ficticia sobre un HEAD de #145 reconciliado con `main`.
