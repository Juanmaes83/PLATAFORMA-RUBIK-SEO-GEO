# ADR 0023 · Identidad del ejecutor de las capturas periódicas de Google

**Estado:** propuesto, pendiente de la decisión de Juanma (E1–E3, al final). Solo documentación: no crea tablas, variables, rutas, cron ni cuentas.
**Fecha:** 10/10/2026.
**Depende de:** ADR 0003 (Supabase Auth y tenencia), ADR 0004 (procedencia firmada), ADR 0022 (capturas manuales firmadas e idempotentes) y el diseño de [CAPTURAS-PERIODICAS](../CAPTURAS-PERIODICAS.md) (#74).
**Relacionado:** ADR 0010 (credenciales por cliente), que choca con el mismo límite: nada en Rubik actúa hoy sin la sesión de una persona.

## Contexto

Una captura de GSC o GA4 (ADR 0022) la hace hoy la titularidad del proyecto, con su sesión:

- La RPC `public.google_capture` exige `auth.uid()` y el rol `owner` del proyecto (`private.has_project_role`), y guarda `created_by = auth.uid()`.
- La lectura pasa por OpenSEO con la clave de servidor `OPENSEO_API_KEY`, y la firma usa el anillo `PROVENANCE_*`. Ambas son variables solo de servidor en Production.
- El evento firmado `google.capture` lleva como actor a esa persona.

El planificador de #74 (`src/lib/openseo/google/schedule.ts`) decide **qué** capturar y **cuándo**: ventanas cerradas, clave idempotente por ventana, espera exponencial, bloqueo y tope mensual. No resuelve **quién** ejecuta cuando no hay nadie conectado. Ese es el objeto de este ADR.

Reglas de la plataforma que cualquier opción debe respetar ([CLAUDE.md](../../CLAUDE.md), ADR 0003):

- la aplicación solo usa la clave publicable de Supabase;
- toda tabla expuesta tiene RLS, y la autorización nunca usa `user_metadata`;
- no se relajan las barreras de `src/lib/auth/mode.ts`, `scripts/run-next.mjs` ni `src/instrumentation.ts`, que impiden arrancar con una clave secreta en `NEXT_PUBLIC_*`.

Hechos comprobados el 10/10/2026 en la documentación oficial:

- **Supabase, claves secretas:** «A secret key bypasses every Row Level Security policy you have» y «Policies never apply to a secret key, because service_role has the BYPASSRLS attribute» ([API keys](https://supabase.com/docs/guides/api/api-keys)).
- **Supabase Cron** (`pg_cron`): ejecuta SQL o funciones de la base y puede «make an HTTP request, such as invoking a Supabase Edge Function». Recomienda no más de 8 trabajos simultáneos y no más de 10 minutos por trabajo ([Cron](https://supabase.com/docs/guides/cron)). No se ha comprobado aquí si el plan Free tiene algún límite propio.
- **Vercel Cron:** disponible en todos los planes. En Hobby, como mucho una vez al día y con una precisión de ±59 minutos ([Usage & Pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)). La entrega es «best effort»: puede perder una invocación o repetirla, y no reintenta si falla. Se autentica con la variable `CRON_SECRET`, que Vercel envía como `Authorization: Bearer …` ([Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs)). Hobby no admite uso comercial ([HOSTING](../HOSTING.md), J8).

## Opciones

### A · Ruta de servidor con la clave secreta de Supabase (Vercel Cron)

Un cron llama a una ruta protegida con `CRON_SECRET`, que usa un cliente con `sb_secret_…` para leer las programaciones y guardar las capturas.

- **A favor:** es lo más sencillo de programar.
- **En contra:**
  - rompe la regla de «solo clave publicable»;
  - la clave se salta **todo** el RLS de **todos** los proyectos, así que un fallo en esa ruta expone la base entera;
  - obliga a reescribir en código las comprobaciones que hoy hacen RLS y `google_capture`, o a llamarlas como un actor ficticio.
- **Veredicto:** se descarta.

### B · Edge Function o `pg_cron` dentro de Supabase con `service_role`

El reloj y la ejecución viven en Supabase.

- **A favor:** no depende de Vercel.
- **En contra:**
  - tiene el mismo bypass de RLS que A;
  - además, habría que copiar el anillo de firma y `OPENSEO_API_KEY` a los secretos de Supabase, lo que duplica la custodia (K1/K2 de [CUSTODIA-CLAVES](../CUSTODIA-CLAVES.md)) y lleva una clave HMAC a otro proveedor;
  - y dos sitios firmando complican la rotación.
- **Veredicto:** se descarta como identidad. `pg_cron` puede servir **solo como reloj** (ver E3).

### C · Cuenta ejecutora dedicada en Supabase Auth, con la clave publicable

Una cuenta de Supabase Auth exclusiva para ejecutar programaciones, por ejemplo `ejecutor@…`. Inicia sesión desde el servidor con la clave publicable, como cualquier usuario, y obtiene un JWT normal sometido a RLS.

- **Permisos mínimos:**
  - **no** es miembro de ningún proyecto, así que el RLS no le deja leer nada;
  - solo puede llamar a una RPC nueva, `google_capture_scheduled`, que comprueba en SQL que:
    1. la programación existe, está `ACTIVE` y la creó la titularidad del proyecto;
    2. la cuenta que llama es la ejecutora registrada en esa programación;
    3. el proveedor, la conexión y la asociación siguen activos y son los de la programación;
    4. la clave es la determinista de la ventana y no se supera el tope mensual.
  - Después reutiliza el mismo `begin`/`store` de ADR 0022.
- **Auditoría:** el evento firmado lleva como actor a la cuenta ejecutora y, en el detalle, el id de la programación y la persona titular que la creó.
- **Secreto:** la contraseña de la cuenta, solo en Production y como variable sensible. Se rota cambiando la contraseña y se revoca deshabilitando la cuenta o pausando las programaciones.
- **Alcance si se filtra:** solo capturas de programaciones activas, ya autorizadas y con tope. No puede leer datos, crear programaciones ni actuar fuera de ellas.
- **En contra:**
  - es un secreto nuevo que custodiar;
  - pasa un inicio de sesión por cada ejecución, con sus límites de frecuencia de Auth;
  - hace falta la RPC nueva con pgTAP;
  - y el reloj de Vercel Hobby no sirve para uso comercial.
- **Veredicto:** es el destino recomendado para la ejecución automática, cuando se cumplan sus requisitos (E2).

### D · Semiautomático: el planificador propone y la titularidad confirma

No hay identidad nueva. La página Google del proyecto calcula con el planificador qué ventanas cerradas faltan. La titularidad pulsa «Capturar ventanas pendientes» y se ejecutan con **su** sesión mediante la RPC actual, una por ventana, con su clave determinista.

- **A favor:**
  - no hay secretos nuevos ni cambios en las reglas;
  - funciona hoy en Hobby;
  - la idempotencia por ventana evita duplicados aunque se pulse dos veces o se pierda la respuesta;
  - y valida con datos reales el planificador, la comparación de capturas y el tope antes de automatizar.
- **En contra:** no es automático, porque alguien tiene que entrar. Las ventanas atrasadas se recuperan, pero hasta el límite de `catchUp`.
- **Veredicto:** fase 1 recomendada.

## Decisión propuesta

1. **Fase 1 (D):** programaciones semiautomáticas con la sesión de la titularidad.
   - La migración de C4 crea `private.google_capture_schedules` y el registro de ejecuciones, con RLS: alta, pausa y cancelación solo para la titularidad, y lectura para los miembros del proyecto.
   - La interfaz muestra las ventanas pendientes y un botón de confirmación. Nada se ejecuta solo.
   - Primera programación sugerida: GSC semanal de Sarah, con `catchUp = 0` y tope de 4 al mes ([CAPTURAS-PERIODICAS](../CAPTURAS-PERIODICAS.md) §«Orden de activación»).
2. **Fase 2 (C):** ejecución automática con una cuenta ejecutora dedicada y la clave publicable. Solo cuando:
   - la fase 1 lleve al menos dos semanas de capturas comparables sin incidencias;
   - J8 esté resuelto (plan comercial de Vercel), o se elija Supabase Cron como reloj;
   - y Juanma cree la cuenta y la variable, porque es él quien maneja los secretos.
   La migración de esa fase añade la columna de la ejecutora y la RPC `google_capture_scheduled`, con sus propias pgTAP.
3. **A y B quedan descartadas.** Si algún día hiciera falta una clave secreta, se haría con un ADR nuevo que lo justifique, nunca dentro de la aplicación.

**Por qué este orden:** D no cambia ninguna regla, se puede probar hoy y deja la tabla diseñada para C sin rehacerla. C mantiene el RLS como barrera también para la máquina. A y B la quitan.

## Consecuencias

- **C4 no depende de la fase 2.** La migración de programaciones y ejecuciones sirve para D y admite después la columna de la ejecutora sin reescribirse.
- **No cambia nada de lo ya fusionado:** ni `google_capture`, ni el anillo, ni las barreras de arranque.
- **Coste:** en la fase 1, cada ventana confirmada es una lectura de OpenSEO. Las herramientas GSC/GA4 de OpenSEO no consumen créditos según su documentación (ADR 0022 §Coste); el tope mensual de la programación acota la cuota de Google.
- **Riesgo residual de C:** la custodia de una contraseña más. Se mitiga con el alcance mínimo, la rotación junto con el anillo (K2) y la pausa inmediata de las programaciones.

## Decisiones para Juanma

| # | Pregunta | Recomendación |
|---|---|---|
| E1 | ¿Aprobar la fase 1 (D: semiautomático con tu sesión)? | **Sí.** Desbloquea C4 y la interfaz en modo pausa, sin secretos ni gasto |
| E2 | ¿Aprobar C (cuenta ejecutora con clave publicable) como destino de la fase 2, sin crearla aún? | **Sí, como dirección.** Crear la cuenta y su variable lo harás tú, más adelante |
| E3 | ¿Qué reloj para la fase 2? | Lo decidimos con J8: Vercel Cron en Pro (precisión al minuto), o Supabase Cron llamando a la ruta protegida con `CRON_SECRET`. No hay que elegirlo ahora |

## Pruebas exigidas al implementar

- **Fase 1 (C4 y la interfaz):**
  - pgTAP: RLS de las dos tablas, alta, pausa y cancelación solo para la titularidad, rechazo a otros roles y proyectos, y `WITH CHECK` en las actualizaciones.
  - Vitest: las ventanas pendientes salen del planificador y la confirmación reutiliza la clave determinista; un doble envío no duplica.
  - e2e: estado vacío honesto a 360 px.
- **Fase 2:**
  - pgTAP de `google_capture_scheduled`: la ejecutora no lee tablas, rechaza programaciones pausadas, ajenas o sin ejecutora, rechaza una clave que no es la de la ventana, y respeta el tope.
  - Integración con el stack local: una ejecución con la cuenta ejecutora guarda una vez y la repetición devuelve lo guardado.
