# Consumo y presupuesto por proyecto

Decisión del propietario, 09/10/2026:

- **Techo de gasto variable:** 10 € por mes natural y por proyecto. Es un techo, no un objetivo de gasto.
- **Fuera del techo:** las suscripciones y los costes fijos de infraestructura, que se deciden aparte.
- **Qué permite esta decisión:** implementar y probar con simulaciones.
- **Qué no autoriza todavía:** llamadas de pago, la conexión de Sarah en Rubik, el modo `project`, secretos ni servicios nuevos.

## 1. Cómo cobra OpenSEO

Fuente: el código de referencia `Juanmaes83/open-seo@0ffff93`. Los artículos de terceros solo sirven para contrastar.

- **Unidad:** créditos del plan alojado. 1000 créditos = 1 USD (`AUTUMN_SEO_DATA_CREDITS_PER_USD`).
- **Moneda de facturación:** USD. Los eventos de uso llevan `currency: "USD"`.
- **Cobro:**
  - Antes de la llamada solo se comprueba que el saldo sea mayor que cero. No hay estimación previa.
  - Después de la llamada se cobra el coste real que comunica DataForSEO × 1,28, redondeado hacia arriba a créditos enteros.
  - Se gastan primero los créditos mensuales del plan y después los de recarga.
  - El saldo puede quedar en negativo.
- **Coste por llamada:** la respuesta MCP no informa del coste. `meta.creditsCharged` existe en el esquema, pero ninguna herramienta lo rellena. Solo `whoami` devuelve `creditsRemaining`, y es un saldo de cuenta compartido entre proyectos.
- **Tope por llamada:** solo `run_rank_tracker` acepta `maxCostCredits`, y limita la **estimación**, no el cobro real. El resto de herramientas no aceptan tope.
- **Recargas:**
  - Manuales, de 10 a 99 USD, solo con plan de pago.
  - No existen recargas automáticas en el código.
- **Plan base:** 10 USD al mes, con 10 USD de créditos de uso incluidos que no se acumulan. Es un coste fijo y se decide aparte.
- **Impuestos:**
  - El *checkout* recoge NIF/IVA y dirección, pero el código no calcula impuestos («no Stripe Tax»).
  - Si Stripe añade IVA según la configuración de su panel no se ve en el código: **sin confirmar**.
- **Gratis:** Search Console (`get_search_console_performance`, `inspect_urls`), las nueve herramientas de GA4 y `get_search_opportunities`, además de `whoami`, `list_projects` y las lecturas de auditoría.

**No confirmado en la instancia alojada.** La página pública de precios (`openseo.so/pricing`) no se puede consultar desde este entorno porque la red la bloquea. Las reseñas de terceros coinciden en lo siguiente:

- plan de 10 USD con 10 USD de créditos;
- recargas que no caducan;
- errores al agotar el saldo, en lugar de cobros adicionales.

Nada de esto sustituye a la factura o la pantalla de facturación de la cuenta.

## 2. De euros a créditos

`src/lib/budget/conversion.ts` (`ceilingToCredits`). Es una función pura, sin valores implícitos.

```
créditos = ⌊ techo € ÷ (1 + IVA) × (1 − margen de cambio) × USD por € × créditos por USD ⌋
```

- **IVA:** el que realmente se paga sobre el precio del proveedor; si hay inversión del sujeto pasivo, 0.
- **Margen de cambio:** cubre la variación del tipo de cambio entre la fecha del tipo y el cobro.
- **Redondeo:** siempre hacia abajo, para que el redondeo nunca supere el techo.
- **Si falta algún dato no hay límite.** Sin límite, el registro de consumo no admite reservas: falla cerrado.
  - Falta un dato cuando la tarifa no está confirmada en la cuenta, el tipo de cambio no tiene fecha y fuente o tiene más días de los permitidos, o el tratamiento del IVA no está confirmado.
- **10 € no son 10.000 créditos.** Ejemplo **ilustrativo**, con datos que no son reales: IVA 21 %, margen 5 % y 1,10 USD/€ dan 8636 créditos.
- **Junto al límite se guarda su base.** El campo `conversion` del presupuesto incluye techo, tarifa, moneda, tipo y fecha, IVA, margen y fuentes. Así cualquier cifra en euros del resumen se puede rastrear.

**Datos que tiene que confirmar Juanma**, desde la facturación de su cuenta de OpenSEO o desde una factura:

1. Moneda facturada y precio de los créditos (se espera USD y 1000 créditos por USD).
2. Si la factura añade IVA, y a qué tipo, o si aplica inversión del sujeto pasivo con NIF-IVA.
3. Si el banco o la tarjeta aplica comisión de cambio. Si la aplica, se incluye en el margen.
4. El tipo de cambio de referencia que se usará, con su fecha. Por ejemplo, el del BCE del día en que se fija el límite. El BCE tampoco es accesible desde este entorno.

## 3. Controles de consumo

Migración `20261010150000_provider_spend_controls.sql`, sobre la `20261010090000`. Ninguna de las dos está aplicada en alojado.

| Control | Cómo |
|---|---|
| Reserva previa | `reserve` antes de cualquier llamada de pago. Sin presupuesto, bloqueado o sin margen: `23514` y la llamada no se hace |
| Concurrencia | Bloqueo consultivo por proyecto y proveedor. Dos reservas simultáneas no pueden superar juntas el límite |
| Reintentos sin cobro duplicado | `idempotencyKey`, única por proyecto y proveedor mientras la reserva está abierta o liquidada. Un reintento devuelve la reserva original y `withSpend` no vuelve a llamar: responde `ALREADY_SETTLED` o `RESERVATION_OPEN` |
| Fallo inesperado | Si la llamada lanza un error, la reserva queda abierta por su máximo. Nunca se libera algo que pudo haberse cobrado |
| Liquidación | `settle` con el coste real, una sola vez; `release` solo si no hubo gasto |
| Coste por encima del máximo | Se registra tal cual y **bloquea** el proveedor en ese proyecto hasta que el titular revise y vuelva a fijar el límite |
| Bloqueo al alcanzar el límite | La suma de liquidaciones y reservas abiertas del mes UTC no puede superar el límite |
| Sin recargas ni consultas programadas | No existe ninguna ruta de código que recargue o programe consultas |

**Regla 6, herramientas sin máximo verificable:** `src/lib/budget/paid-tools.ts`.

- Todas las herramientas de pago de OpenSEO quedan en `BLOCKED_NO_CAP`.
  - Su coste solo se conoce después de la llamada.
  - OpenSEO no lo informa por llamada.
- `run_rank_tracker` también queda bloqueada, porque su tope limita la estimación, no el cobro.
- Para liquidar habría que medir la diferencia de `whoami` antes y después de la llamada. Ese saldo es de toda la cuenta, así que con llamadas concurrentes de otros proyectos no se puede atribuir el gasto a un proyecto concreto.
- Para desbloquear una herramienta harían falta dos cosas:
  - un máximo verificable por llamada, del proveedor o de OpenSEO;
  - la aprobación expresa del propietario, revisada en un PR.

## 4. Resumen mensual

`/proyectos/<organización>/<proyecto>/consumo` es solo para el titular y de solo lectura. Muestra, por mes natural en UTC:

- límite en créditos, créditos del mes y coste con impuestos;
- por operación:
  - liquidadas, abiertas y liberadas;
  - créditos y coste;
  - cuántas dejaron un resultado firmado guardado (utilidad obtenida);
  - cuántas superaron el máximo.

Si un dato no existe, la página lo dice. El coste en euros solo aparece si el límite se fijó con su base documentada. Si la lectura falla, la página no lo presenta como un mes sin consumo.

## 5. Pruebas

- **pgTAP:**
  - `provider_spend_controls` (33): idempotencia, bloqueo por exceso, conversión, resumen y aislamiento;
  - `provider_budget` (39), ajustada al bloqueo.
- **Rollback** probado: `docs/rollback/provider-spend-controls-rollback.sql`.
- **Vitest:**
  - `budget-ledger`: reintentos, fallos, resumen;
  - `budget-conversion`: conversión y política de herramientas.
- **e2e:** página de consumo para titular y analista, a 360, 390 y 1280 px.
