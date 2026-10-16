# Contraste del supervisor · F-OPS-2 · 16/10/2026

## Referencias
- Expediente Claude: b3b7a35f53ab85b0a137107aafd4dbf4b7caf722.
- Código inspeccionado: #120@5e64b48f3701cecbbae0b9ad79381e3c59a0ef78.
- No se ejecutaron proveedores ni operaciones alojadas.

## Comprobaciones propias
GitHub confirma que el commit de Claude solo modifica los cuatro documentos de docs/n1-cierre.
#120 continúa abierta en el SHA indicado.

En src/lib/openseo/google/capture.ts:
- se comprueban bandera, parámetros y keyring;
- se reserva la clave y se consulta runManualGoogleReport;
- completeTrustedProviderCommand se ejecuta después de la lectura;
- no hay comprobación explícita del escritor antes de la primera consulta;
- un fallo de almacenamiento libera la reserva.
Esto permite una consulta externa seguida de fallo de persistencia si el escritor no está disponible; no se ha demostrado un consumo real en Production.

En src/lib/openseo/project-audit.ts:
- startProjectAudit reserva trabajo y llama startSiteAudit sin comprobar explícitamente el escritor;
- followProjectAudit comprueba keyring cuando save=true, pero llama al proveedor antes de completeAuditJob, sin comprobación explícita del escritor.
El lanzamiento sin escritor puede estar permitido por el contrato existente; su aceptación operativa exige revisar cómo se conserva evidencia durable del efecto externo. No concluir por esta lectura que todo lanzamiento es por sí mismo un defecto.

## Corrección requerida y límites
Priorizar una comprobación de preparación para los caminos externos que necesitan persistencia firmada:
configuración, conexión y dependencias mínimas relevantes, sin ampliar privilegios.
Comprobar en pruebas que escritor ausente o no utilizable evita la llamada al proveedor en esos caminos, sin dejar reservas nuevas.
Conservar replay de resultados guardados y el tratamiento seguro de efectos externos ambiguos.
Una comprobación previa no elimina una caída posterior a la llamada: documentar recuperación/reconciliación y no prometer atomicidad entre proveedor y base.

No bloquear indiscriminadamente revocaciones o retiradas de acceso por la ausencia del firmante.
Si el esquema S1 está presente, un efecto con recibo transaccional pendiente no equivale a un efecto sin rastro. El drenaje puede completar la firma.
Si el esquema alojado es desconocido, no afirmar que existe ese recibo.
Separar disponibilidad de firma, durabilidad del recibo y efecto externo.

## Expediente N1: correcciones de vigencia
La decisión de aceptar descarga UNPROVEN quedó retirada por 6ff886c/5e64b48: no sigue pendiente.
V2 firmado exige esquema anterior acreditado y catálogo compatible; N2 reconocido produce v3 aunque la interfaz esté apagada.
Las pruebas JWT 20/20 son comunicadas por Claude, no repetidas por el supervisor.
Mantener sus conclusiones acotadas a la configuración ensayada; el rechazo HS256 sin causa determinada no demuestra que HS256 esté deshabilitado en alojado.
El rechazo a tokens de otro proyecto debe probarse también en el entorno aislado autorizado.

## Operación
El acceso al Supabase histórico y su destino real sigue pendiente de acreditación.
El historial completo debe compararse con main, no solo su máximo timestamp y número de entradas.
La autenticación del navegador de trabajo no se ha completado; no se ha inspeccionado el esquema alojado.
No se han fusionado PR, configurado variables, activado proveedores ni modificado Production.
