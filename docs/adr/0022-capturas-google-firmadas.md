# ADR 0022 · Capturas manuales de Search Console y GA4, firmadas e idempotentes

**Estado:** aceptado e integrado en #66. Migración `20261012120000` aplicada en alojado por Juanma; `OPENSEO_GOOGLE_READS_ENABLED=true` solo en Production; capturas reales de Sarah `STORED/OK` el 10/10/2026. *(Al proponerse estaba en la rama `claude/google-captura`, sin aplicar y con las lecturas apagadas.)*
**Fecha:** 10/10/2026.
**Depende de:** ADR 0004 (procedencia firmada), ADR 0007 (conexión OpenSEO por proyecto), #60 (asociación de propiedad), #61 (lectura manual acotada) y #62 (origen firmado, Core D-30).

## Contexto

Tras #60–#62, Rubik podía leer de forma acotada un informe GSC o GA4 de la propiedad asociada, pero no lo guardaba. Faltaba (HANDOFF de Codex, 10/10/2026): revalidar permisos y propiedad al guardar, persistencia transaccional, idempotencia, historial, detalle, verificación, exportación e interfaz manual sin consulta al cargar.

## Decisión

### Dónde se guarda

En `public.provider_results`, como el resto de resultados firmados. Así la verificación de firma, la exportación del proyecto, el ensayo de restauración y el borrado ya existentes cubren las capturas sin código nuevo. Un registro privado, `private.google_captures`, guarda la idempotencia y el origen de cada captura.

### Flujo (servidor, `src/lib/openseo/google/capture.ts`)

1. Antes de reservar nada: flag activado, consulta válida (máximo 31 días y 100 filas), clave de idempotencia válida y anillo de firma configurado.
2. **`begin`**: resuelve en el servidor la conexión y la propiedad activas y reserva la clave para ellas. Si la clave ya está guardada, devuelve el mismo resultado **sin volver a consultar** a Google. Si otra petición con la misma clave está en curso, la rechaza (`55P03`). Una reserva abandonada más de 5 minutos se puede retomar.
3. Una sola llamada al proveedor. La fuente usada debe ser la reservada.
4. Se firma con el anillo del servidor; la firma incluye `sourceContext` (conexión, asociación y proyecto de OpenSEO).
5. **`store`**: en una sola transacción vuelve a comprobar que la conexión y la asociación siguen activas y son las reservadas, que el resultado es de este proyecto y proveedor, que su `sourceContext` coincide y que el estado es una medición (`OK`, `PARTIAL` o `EMPTY`). Inserta el resultado y marca la captura como guardada.
6. Cualquier fallo después de reservar libera la clave. Tras guardar se registra el evento firmado `google.capture`.

### Quién

Solo la titularidad del proyecto, igual que la asociación de propiedad (#60). El historial y el detalle los ve cualquier miembro del proyecto (RLS de `provider_results`).

### Interfaz (`/proyectos/<org>/<proyecto>/google`)

- Asociar o revocar la propiedad de cada proveedor, con confirmación. No consulta a Google.
- Formularios de captura solo con las lecturas activadas. Cada formulario lleva una clave de idempotencia generada al mostrarlo, así que un doble envío guarda una sola vez.
- Historial y detalle con la firma verificada, el periodo, la propiedad, el origen y las filas en tarjetas (sin scroll horizontal). Si la firma no verifica, no se muestran las filas.
- Abrir las páginas nunca consulta a Google.

### Coste

Las herramientas de GSC y GA4 de OpenSEO no consumen créditos según su documentación ([CONSUMO-Y-PRESUPUESTO](../CONSUMO-Y-PRESUPUESTO.md)), por eso no se reserva presupuesto. Si eso cambia, la captura debe pasar por el registro de consumo antes de activarse.

## Fuera de alcance

- Activar las lecturas, asociar la propiedad real de Sarah o aplicar la migración en alojado: son decisiones separadas de Juanma.
- Otros informes de GA4 o GSC, capturas periódicas y comparativas (fase 5).

## Pruebas

- **pgTAP** `supabase/tests/google_captures.test.sql` (30): privilegios, solo titulares, clave inválida, fuente ajena o de otro proveedor, reserva, concurrencia, resultado con otra conexión, estado de error o de otro proyecto, guardado, repetición sin nueva reserva, doble guardado, liberación y reutilización, toma de reservas abandonadas, revocación entre reserva y guardado, inventario y borrado en cascada.
- **Vitest** `tests/openseo-google-capture.test.ts` (5): firma verificable con el origen, repetición sin llamada, comprobaciones previas sin RPC ni proveedor, liberación ante revocación y error, concurrencia.
- **Integración** `tests/integration/google-capture.integration.test.ts` (stack local, MCP simulado): guardar, verificar, listar, exportar y auditar; repetición; analista rechazado; revocación.
- **e2e**: estados de la página para la titularidad y para un analista a 360, 390 y 1280 px (capturas 33 y 34).
- `organization_erasure` amplía a 15 tablas el borrado sin filas huérfanas.

## Rollback

`docs/rollback/google-captures-rollback.sql`.
