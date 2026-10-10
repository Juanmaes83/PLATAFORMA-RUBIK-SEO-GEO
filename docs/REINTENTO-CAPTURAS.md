# Reintento de capturas Google: cómo funciona y cómo comprobarlo en producción

**Estado:** procedimiento preparado el 10/10/2026, **no ejecutado**. Lo ejecuta Juanma. La prueba recomendada (A) no consulta a Google ni escribe datos.

## 1. Cómo funciona la idempotencia

- Al mostrar la página «Search Console y GA4», cada formulario de captura lleva una **clave de idempotencia** oculta, generada en el servidor (`randomUUID`).
- Al enviarlo, `begin` reserva esa clave **antes** de llamar a Google ([ADR 0022](adr/0022-capturas-google-firmadas.md)):
  - si la clave ya está **guardada**, devuelve esa captura y no llama a Google;
  - si está **en curso**, rechaza el envío (`55P03`) y no llama a Google;
  - si se **liberó** tras un fallo, se puede volver a intentar.
- Una reserva abandonada más de 5 minutos se puede retomar.
- Recargar la página genera **otra** clave: es una captura nueva, no un reintento. Un reintento real reenvía **el mismo formulario**.

### Casos cubiertos por pruebas automáticas

| Caso | Resultado | Prueba |
|---|---|---|
| Reenvío del mismo formulario tras guardar | Misma captura, sin llamar a Google | Vitest, pgTAP e integración |
| Dos envíos a la vez con la misma clave | El segundo se rechaza sin llamar a Google | Vitest y pgTAP |
| Timeout o error de Google | No se guarda nada; la clave se libera y el mismo formulario puede reintentar | Vitest |
| Se pierde la respuesta de un guardado que sí se completó | El reintento con la misma clave devuelve lo guardado sin llamar a Google; liberar una clave guardada no la cambia | Vitest y pgTAP |
| Reserva abandonada (caída a mitad) | Se puede retomar pasados 5 minutos | pgTAP |
| Conexión o propiedad revocada entre reserva y guardado | No se guarda nada | pgTAP, Vitest e integración |
| Reintento con la misma clave **después de restaurar** el proyecto | Misma captura, sin llamar a Google | Ensayo local e integración `restore-google` |

La ausencia actual de duplicados en producción y estas pruebas son evidencias distintas. Ninguna sustituye a la otra.

## 2. Prueba A (recomendada): reintento en la base de producción sin consultar a Google

**Qué demuestra:** que en la base de datos real, la clave de una captura ya guardada devuelve esa misma captura y no inicia otra.

**Efectos:** ninguno. `begin` sobre una clave guardada solo lee: toma un bloqueo de esa fila durante la consulta y devuelve el resultado. No escribe, no llama a Google, no consume créditos y no añade eventos de auditoría.

**Requisitos:** acceso de Juanma al editor SQL de Supabase del proyecto `yvdgmklgwlshizzgefpv` y el UUID de su propia cuenta, que es titular del proyecto de Sarah. No usar la cuenta de otra persona.

1. Leer las claves guardadas de Sarah (solo lectura):
   ```sql
   select idempotency_key, provider, connection_id, property_binding_id, result_id
   from private.google_captures
   where project_id = 'b8d00961-1141-4741-908a-54d2e3bf343a' and state = 'STORED';
   ```
   Deben salir las dos capturas del 10/10 (GSC `45f2c4c7-…` y GA4 `e9140843-…`).
2. En **una transacción que se deshace al final**, actuar como Juanma y repetir `begin` con la clave de GSC:
   ```sql
   begin;
   select set_config('role', 'authenticated', true),
          set_config('request.jwt.claims', json_build_object('sub', '<UUID de Juanma>', 'role', 'authenticated')::text, true);
   select public.google_capture('b8d00961-1141-4741-908a-54d2e3bf343a', 'begin',
     jsonb_build_object('key', '<idempotency_key de GSC>', 'provider', 'search-console',
       'connectionId', '<connection_id>', 'propertyBindingId', '<property_binding_id>'));
   rollback;
   ```
3. **Resultado esperado:** `{"state": "STORED", "resultId": "45f2c4c7-fdbd-4700-a940-1cbb8916cfce"}`. Repetir con la clave de GA4: el resultado esperado es su `resultId`, `e9140843-…`.
4. Comprobar que nada cambió: la consulta del paso 1 devuelve lo mismo y en el historial de la aplicación siguen apareciendo dos capturas.
5. **Si sale otra cosa** (un error o `RESERVED`), parar y avisar: no reintentar. `RESERVED` solo es posible con una clave no guardada y, por el `rollback`, no deja nada.

## 3. Prueba B (opcional): reintento desde la interfaz

Solo cuando Juanma decida hacer una captura nueva de verdad. Esa primera captura consulta a Google: consume cuota de la API de Google, pero no créditos de OpenSEO.

1. En `/proyectos/<org>/<proyecto>/google`, enviar una captura y esperar a la página de detalle.
2. Con la flecha **atrás** del navegador, volver al formulario **sin recargar** y pulsar de nuevo «Capturar y guardar».
3. **Resultado esperado:** el aviso «Esta captura ya estaba guardada: se muestra la misma, sin volver a consultar a Google» y la misma dirección de detalle. En el historial hay una sola captura nueva.
4. Si el navegador regeneró el formulario (aparece una segunda captura), anotarlo: el navegador creó una clave nueva. La garantía de la clave la demuestra la prueba A, no este paso. No repetir.

## 4. Registro

Anotar en HANDOFF la fecha, la prueba ejecutada (A, B o las dos), el resultado de cada paso y cualquier discrepancia. Usar solo identificadores, nunca datos de las filas.
