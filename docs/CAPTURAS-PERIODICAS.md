# Capturas periódicas de Google: diseño y pruebas simuladas (Bloque 4)

Fecha: 10/10/2026. Integrado en #74 (`742ef55`).

**Estado: solo diseño y simulación. No está activado.** Ninguna ruta, acción, cron, tabla ni variable usa este código. Una prueba lo comprueba: ningún archivo de `src` importa el planificador y no hay `crons` en `vercel.json`. No se consulta a Google ni se gasta cuota.

## Qué existe

- `src/lib/openseo/google/schedule.ts`: planificador **puro y determinista**. Recibe la programación, las ejecuciones registradas y el reloj, y devuelve qué hacer. Los efectos (capturar, comprobar si sigue activa) se inyectan.
- `tests/openseo-google-schedule.test.ts` (10 pruebas): reloj simulado y una captura simulada con la misma regla de idempotencia que la migración `20261012120000`.

## Diseño

| Pieza | Regla | Por qué |
|---|---|---|
| **Snapshots** | Cada ejecución es una captura manual normal (ADR 0022): firmada, en `provider_results`, en la exportación y en la restauración | No hay un segundo camino de guardado que auditar |
| **Ventanas** | Semanal: semanas ISO completas (lunes a domingo). Mensual: meses naturales completos. Solo cuando el último día tiene al menos 3 días (GSC) o 2 (GA4) | Datos razonablemente cerrados. Dos semanas seguidas tienen la misma duración y no se solapan, así que la comparación del Bloque 3 no da avisos de periodo. Los meses miden 28–31 días y sí los darían |
| **Idempotencia** | Clave determinista por programación y ventana: `sched_<gsc|ga4>_<id>_<inicio>_<fin>` | Un tick repetido, una caída después de guardar o dos ejecutores a la vez devuelven la captura guardada sin volver a leer Google |
| **Reintentos** | `UNAVAILABLE`, `IN_PROGRESS`, `STORE_FAILED` y `PROVIDER_STATUS`: espera exponencial desde 15 min, con un tope de 24 h, y como máximo 5 intentos. Después, `GAVE_UP` | Fallos transitorios sin martillear al proveedor |
| **Bloqueo** | `NOT_CONNECTED`, `FORBIDDEN`, `DISABLED`, `SIGNING_NOT_CONFIGURED`, `SOURCE_CHANGED`, `INVALID` y `CONFIGURATION` bloquean **toda** la programación | Necesitan una persona: propiedad revocada, lecturas apagadas, anillo ausente o fuente cambiada |
| **Cancelación** | Una programación en pausa o cancelada no captura. Se vuelve a comprobar antes de cada captura del mismo tick | Cancelar surte efecto de inmediato |
| **Presupuesto** | Tope de capturas **iniciadas** por mes natural (UTC), reintentos incluidos; como máximo una por tick por defecto | Acota el consumo de cuota y de OpenSEO |
| **Recuperación** | `catchUp` recupera N ventanas perdidas además de la última. Lo ya guardado se reconoce por la clave | Una caída de días se recupera sin duplicar ni leer de más |

## Qué falta para activarlo (decisiones de Juanma, por separado)

1. **Identidad de servidor sin sesión.** Hoy toda captura usa la sesión de la titularidad (RLS y `google_capture` exigen `owner`). Un ejecutor periódico no tiene sesión. Las opciones (proceso con una clave secreta de Supabase acotada, Edge Function o `pg_cron` con una cola) cambian una regla de la plataforma: la aplicación solo usa la clave publicable. Hace falta un ADR propio y aprobarlo. Es el mismo límite que señala el ADR 0010.
2. **Tablas.** Una migración nueva con `private.google_capture_schedules` (programación, estado, tope y `catchUp`) y el registro de ejecuciones. Ambas con RLS, alta y pausa solo para la titularidad, y pgTAP. No se ha creado.
3. **Cuota y coste.** Cada ejecución es una lectura de OpenSEO/Google. Fijar el tope mensual dentro del techo de 10 € acordado ([CONSUMO-Y-PRESUPUESTO](CONSUMO-Y-PRESUPUESTO.md)) y comprobar la tarifa vigente.
4. **Dónde corre el reloj.** Vercel Cron, `pg_cron` o un worker. Cada uno tiene sus límites de plan; hay que verificarlos en la documentación oficial al decidir. Vercel Hobby no admite uso comercial.
5. **Interfaz.** Alta y pausa por la titularidad, estado de cada ventana (guardada, en espera hasta…, abandonada, bloqueada por…) y aviso cuando una programación se bloquea.

## Orden de activación propuesto

ADR de identidad del ejecutor → migración con pgTAP → interfaz en modo pausa → una programación semanal de GSC de Sarah con `catchUp = 0` y tope 4/mes → revisar dos semanas de capturas y su comparación → ampliar.
