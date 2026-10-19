# U03 V-4 · campaña de retirada y recibo firmado en Preview

**Estado alojado: NO EJECUTADO.** El operador único está implementado y ensayado en el stack local aislado con 27 migraciones N1. No se ejecutó SQL, no se instaló el rol y no se crearon fixtures en Preview. El siguiente paso es una sola invocación Windows de Juanma, con una entrada oculta para la conexión administrativa; no requiere la secuencia manual de `psql`.

## Contrato del gate y entorno

| Pregunta | Evidencia / conclusión |
|---|---|
| ¿Qué acredita V-4 en Preview? | La retirada `project_people(remove)` del actor A, la denegación de la petición siguiente con el mismo JWT aún vigente, el recibo `member.withdraw` auténtico, cadena/HMAC, reintento idempotente y limpieza de solo los fixtures propios con inventario/outbox a cero en el Preview aislado. Sigue siendo la evidencia necesaria para U03. |
| ¿Qué acreditaría la misma secuencia en Production? | Que el flujo de producto y el escritor N1 Production pueden firmar y completar un recibo ficticio en ese entorno. No acredita la identidad, el estado, RLS ni las capacidades de V-4 en el Preview aislado. Podría aportar solo a un subensayo H1 del escritor, si se autoriza por separado y queda separado del gate U03. |
| ¿Qué afirmación U03 quedaría sin acreditar al cambiar de entorno? | La retirada y denegación posteriores bajo las políticas y configuración efectivas de `rhnnplewqsekrnaousyl`. Los 12 controles Data API y B-4 permanecen evidencia previa de Preview, pero Production no completa este caso de Preview. |
| ¿Se acepta formalmente esa sustitución? | No con el contrato vigente. Roadmap N1-05 y el protocolo U03 sitúan el aislamiento alojado en Preview; una sustitución requiere decisión del propietario y cambio explícito de alcance. No se relaja RLS, TLS, autenticación, firma, limpieza ni Vercel Authentication. |

El deployment Production observado en esta sesión está READY en `main@f39620e347756e980192aac8fe93b9a2e8db6376`; `/api/salud` confirma el ref `yvdgmklgwlshizzgefpv`. La lectura de solo lectura de `RUBIK_AUDIT_DATABASE_URL` dentro de `vercel env run -e production` informó que no estaba presente. La consulta remota de la CLI no llegó a PostgreSQL porque la red Windows no admite IPv6, y el conector Supabase negó permisos. Por ello, el estado actual del login/grants/outbox de `rubik_audit_writer` **no está revalidado**; la prueba alojada histórica del escritor no se usa como estado actual ni como autorización para escribir en Production. No se hizo ninguna escritura en Production.

## Operador Windows único

`scripts/u03-preview-b4-owner.ps1 -MembershipRevocationOnly` llama a `scripts/u03-preview-v4-operator.mjs`. Antes de fixtures, el operador exige:

- deployment Preview exacto `dpl_6fqataMxfkGFSZJKVGk5xJe8snXq`, proyecto Vercel `prj_HgnTtNtisi9Kt1A4Dq2pxoCQBook`, host `plataforma-rubik-seo-bdzqlpg6z-juanma-espinosas-projects.vercel.app` y SHA de app desplegada `06c2b4270fc74d88ef3e3560bb5d07d8aeb948e2`;
- `/api/salud` autenticado por OIDC al host fijado, `auth=preview-isolated`, y ref Supabase `rhnnplewqsekrnaousyl`;
- `disable_signup=true`, 27 migraciones N1 exactas hasta `20261015210000`, centinela Preview, inventario y outbox vacíos, `rubik_audit_writer` bloqueado, y ningún `rubik_preview_receipt_writer` preexistente;
- conexión administrativa que demuestre el mismo centinela, privilegio de crear el rol y estado SQL vacío; TLS con CA raíz de Supabase y verificación de hostname.

Después instala el rol temporal **NOLOGIN** con grants y cuatro políticas limitados a auditoría/outbox. Le añade un comentario de propiedad con el UUID del run; el proceso Node genera su contraseña aleatoria y la clave HMAC solo en memoria, y activa `LOGIN` con vencimiento a 30 minutos. La cuenta Admin/Auth y la publicable de Preview vienen de la custodia DPAPI existente; no se guardan en el ledger. El arnés crea solo ownerA y viewer, retira por RPC y comprueba la denegación con el JWT de viewer aún vigente. Firma el recibo por su ID, valida cadena/HMAC y retry, reconcilia como máximo el recibo de retirada pendiente de su propio proyecto si perdió la respuesta, limpia los IDs del ledger y contrasta inventario/outbox mediante una lectura independiente.

En `finally`, Node y el wrapper PowerShell intentan bloquear el rol. El rollback verifica el centinela y UUID del run, confirma `NOLOGIN`, y solo retira grants, políticas y rol si inventario y outbox están a cero. Si hay residuos, el rol queda bloqueado y se conservan ledger/IDs para reconciliación; no se borra un recibo pendiente ni se cambia la guarda. El segundo intento de contención del wrapper es idempotente. La caducidad de 30 minutos es una protección adicional, no sustituye el `finally`.

La entrada oculta solicita **solo una vez** la Database password existente del proyecto Preview mediante `Read-Host -AsSecureString`; no se pega una URL. El helper construye en memoria el endpoint fijado `aws-1-eu-west-3.pooler.supabase.com:5432`, usuario `postgres.rhnnplewqsekrnaousyl` y base `postgres`, y codifica los caracteres reservados con escape RFC 3986. La clave y la URL no se imprimen ni se guardan en archivo; la URL vive en memoria/proceso hasta el `finally`. El operador Node vuelve a validar esquema, host exacto, puerto, usuario/ref y ruta antes de conectar. El driver usa `rejectUnauthorized=true` y la CA fijada; no desactiva TLS ni cambia la contraseña administrativa. El endpoint exacto se validó previamente para Session pooler en [documentación oficial de conexión a PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres).

### Único comando de campaña

Desde la raíz del checkout de #129 en PowerShell Windows:

```powershell
vercel.cmd env run -e preview -- powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/u03-preview-b4-owner.ps1 -MembershipRevocationOnly
```

El comando ejecuta preflight sin claves, carga las claves Preview custodiadas y pide una sola vez la Database password en el prompt oculto; no pide la URL. Ejecuta solo V-4: Data API 12/12 y B-4 se anotan como `SKIP_PRIOR_EVIDENCE` con sus run IDs; no abre Playwright, no llama a proveedores, no cambia Supabase fuera de la ventana V-4 y no altera Vercel Authentication. Si el destino, CA, TLS, privilegios, centinela, migraciones o limpieza no se acreditan, se detiene antes de fixtures o conserva el ledger y IDs para reconciliación. No enviar credenciales por chat.

## Instalación/rollback SQL de respaldo

Los archivos `scripts/u03-preview-v4-role.sql`, `scripts/u03-preview-v4-activate.sql`, `scripts/u03-preview-v4-block.sql` y `scripts/u03-preview-v4-rollback.sql` quedan como superficie de revisión y recuperación. La ruta operativa aprobada en esta PR es el operador único anterior; no requiere ejecutar esos archivos a mano. El SQL nunca se ejecuta en Production, no se añade a migraciones N2 y valida el centinela exacto Preview.

## Vía de firma existente y límites

N1 `20261015145025` hace que `project_people(remove)` retire la membresía y escriba `member.withdraw` en `private.audit_outbox` dentro de la transacción. N1 `20261015201500` impide borrar el proyecto mientras el recibo esté `pending`. `processAuditOutboxWithPool` es el procesador legítimo existente: firma y enlaza `receiptId`, completa el outbox transaccionalmente y hace retry idempotente. El `writerPool()` del producto sigue bloqueado en Preview; el operador llama a la misma rutina con el pool de un rol dedicado temporal, sin modificar `writerPool()`, funciones de producto, grants globales o políticas generales.

El preflight audita todas las funciones y procedimientos ejecutables por el rol, incluidos privilegios efectivos heredados de `PUBLIC` en cualquier schema con `USAGE`. Solo permite `SECURITY DEFINER` `private.audit_writer_project(uuid)` y `public.preview_environment_identity()`. En la base N1 local prevista pasó; añadir otra función `SECURITY DEFINER` ejecutable por `PUBLIC` hizo fallar el preflight antes de fixtures.

## Ensayo local y gates

El stack local aislado se inició desde cero y aplicó las 27 migraciones N1. `scripts/test-u03-v4-rollback-local.mjs` pasó: invitación y retirada por RPC, el mismo JWT vigente denegado, recibo pendiente, firma HMAC/cadena válidas, retry idempotente, limpieza de IDs, inventario/outbox a cero, `NOLOGIN` inmediato, rollback que se detiene con residuos, rollback final idempotente y ejecución del ciclo del operador con marcador de propiedad. Stack local detenido; no hubo SQL ni fixtures alojados.

V-4 permanece **NO EJECUTADO en Preview** hasta la única ejecución Windows anterior. U03 permanece abierto además por los roles/superficies y casos de invitación/consentimiento/sesión pendientes enumerados en la [matriz U03](U03-PREVIEW-MATRIZ-20261018.md). H1 requiere su pasada A integral de acceso a exportación HTTP firmada y restauración/idempotencia, y pasada B U04/Sarah aceptada. H2 requiere H1, U02/U03, N1-07/08 y condiciones operativas/comerciales; GitHub Actions sigue bloqueada por facturación y no cuenta como CI verde.
