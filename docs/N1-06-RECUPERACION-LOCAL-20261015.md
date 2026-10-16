# N1-06 · recuperación y exportación local del piloto Sarah

**Corte:** 15/10/2026. Solo identidades ficticias y stack desechable `rubik-n1-recovery-20261015` (API `127.0.0.1:58321`, BD `127.0.0.1:58322`). No se consultaron ni modificaron datos reales de Sarah, Production, Preview, Vercel ni proveedores.

## R1: exportar con recibos pendientes

La ruta de exportación firmaba un manifiesto aunque S1 hubiera dejado un recibo `private.audit_outbox` pendiente. El manifiesto probaba las filas incluidas, pero no que el efecto ya tuviera auditoría firmada. Ahora el valor local por defecto es **bloquear** con 503 genérico: consulta la cola del proyecto con el escritor SQL, rechaza pendientes, scope inconsistente o recibos completados sin enlace al evento firmado, y compara el número de recibos antes y después de leer. Una caída del escritor también bloquea. Un recibo de otro proyecto no bloquea este. La ruta rechaza además cadena o resultado de firma inválida y cualquier lectura incompleta de estado OpenSEO/Google antes de firmar. No se cambió el formato v1/v2 ni se drenó ningún dato alojado.

El doble control detecta escrituras durante la generación. **No es una instantánea transaccional global**: una escritura iniciada después del último control puede quedar para la siguiente exportación. Para una garantía estricta de punto de corte comercial hace falta coordinar escrituras y exportación en una transacción o ventana de quiescencia, y ligar ese corte al manifiesto versionado. No declarar una exportación antigua con `operations` fallidas como recuperación íntegra; el verificador offline acredita la firma del archivo, no el éxito de lecturas que fallaron al producirlo.

### Propuesta de decisión R1 para el propietario

| Opción | Efecto | Recomendación |
|---|---|---|
| Bloquear | Respuesta 503 y reintento tras firmar recibos; nunca entregar descarga conocida como pendiente | **Recomendada** para piloto y primera operación |
| Drenar | El endpoint intenta firmar antes de exportar; añade latencia, concurrencia y responsabilidad operativa | Solo con límites y ensayo de fallos aprobados |
| Advertir | Entrega archivo con auditoría pendiente claramente marcada | No usar para una descarga presentada como íntegra; requerir formato/estado versionado |

Se solicita decidir política comercial, tiempo máximo de espera, alerta y retención de recibos. El comportamiento local fail-closed no anticipa esa decisión.

## Ensayo local y compatibilidad

El stack nuevo aplicó todas las migraciones hasta `20261015210000`, incluida `20261012130000_google_recovery_state`; la retirada temporal de las dos funciones Google dentro de una transacción devolvió `DROPPED_IN_TX`, y el rollback `RESTORED`. La prueba de integración Google existente cubre conexión y propiedad activa, captura `STORED`, exportación con resultado firmado, restauración doble, conflicto de destino y replay sin una nueva llamada MCP. Las suites de restore cubren manifiesto ausente/manipulado, cadena y resultados, destino parcial, conflicto transaccional, idempotencia y aislamiento. El anillo es aleatorio y local, fuera del repositorio; la exportación no incluye credenciales.

**Límites:** no hay rollback SQL individual versionado para Google recovery; solo ensayo transaccional de retirada de funciones y restauración completa de backup está documentada. El plan no recupera Auth, membresías, presupuestos, trabajos sin resultado ni credenciales. Requiere reaplicar los permisos S1/S2 en el destino antes del plan y comprobarlos después. No ejecutar el SQL de restore contra alojado sin U04.

## Checklist del piloto alojado futuro (U04)

1. Propietario autoriza alcance exacto de datos Sarah, ventana, operador y finalidad; revisa obligaciones legales de acceso, retención y copias.
2. Verifica SHA del despliegue, estado real de migraciones S2/S1/Google y credencial del escritor, con evidencia de lectura sin revelar secretos.
3. Toma backup restaurable y registra el punto de retorno; mantiene el anillo HMAC en sus dos custodias fuera del repositorio, prueba una copia sin transmitirla al agente.
4. Detiene escrituras o demuestra un corte consistente; comprueba cero recibos pendientes del proyecto, cadena y resultados válidos. Descarga exportación y ejecuta `verify:export --require-complete` sin red en máquina de confianza.
5. Manipula una copia ficticia para confirmar detección; genera y revisa un plan en un destino local aislado. Restaura dos veces, verifica firmas, relaciones Google y replay sin proveedor; revisa permisos S1/S2 y residuos.
6. Ante una denegación, firma inválida, estado operativo parcial, migración divergente o dato de otro cliente: parar, preservar backup y evidencia, mantener acceso cerrado. No reparar firmas ni repetir llamadas facturables.

El piloto alojado continúa pendiente de U04, copia de seguridad, custodias y ejecución humana. H1 sigue parcial; H2 requiere además U02/U03 y matriz alojada N1-05.
