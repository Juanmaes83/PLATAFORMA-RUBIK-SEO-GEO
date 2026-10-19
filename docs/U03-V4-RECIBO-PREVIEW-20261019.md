# U03 V-4 · procesador acotado de recibos en Preview

**Estado:** instalación, contención y rollback ensayados en un stack N1 local aislado desde cero; sin instalación ni ejecución alojada. Destino exclusivo `rhnnplewqsekrnaousyl`. No cambia las 27 migraciones N1, Vercel Authentication ni la guarda `writerPool()` que bloquea Preview en la aplicación.

## Reversión operativa obligatoria

El wrapper V-4 **no dispone de credencial administrativa PostgreSQL**. Por ello no puede ejecutar `ALTER ROLE ... NOLOGIN` automáticamente. Emite un aviso al salir, incluso si la campaña falla; el propietario debe ejecutar el bloqueo desde otra terminal administrativa inmediatamente después. La caducidad de 30 minutos limita un cierre abrupto, pero no sustituye el bloqueo. `NOLOGIN` impide sesiones nuevas; antes del rollback hay que dejar terminar la sesión del arnés.

Estos comandos se ejecutan **solo por Juanma** desde la raíz del checkout revisado, con `psql` instalado y la CA del proyecto Preview descargada desde su Dashboard a `%APPDATA%\postgresql\root.crt`. El password administrativo se introduce en el prompt de `psql`, nunca en la línea de comandos, un archivo de entorno o Git. La conexión directa exige conectividad IPv6 o el complemento IPv4; si no existe, detenerse y revisar una conexión de sesión del mismo ref en el Dashboard antes de adaptar el procedimiento. No sustituir el host por un alias implícito.

```powershell
$env:PGSSLROOTCERT = Join-Path $env:APPDATA 'postgresql\root.crt'
if (-not (Test-Path -LiteralPath $env:PGSSLROOTCERT)) { throw 'PREVIEW_CA_MISSING' }
$adminDb = 'host=db.rhnnplewqsekrnaousyl.supabase.co port=5432 dbname=postgres user=postgres sslmode=verify-full'
psql -X -v ON_ERROR_STOP=1 -d $adminDb -f scripts/u03-preview-v4-role.sql
if ($LASTEXITCODE -ne 0) { throw 'V4_ROLE_INSTALL_FAILED' }
psql -X -v ON_ERROR_STOP=1 -d $adminDb
```

Dentro de la sesión interactiva de `psql`, introducir `\password rubik_preview_receipt_writer` y después `\q`. `\password` pide la contraseña exclusiva de este Preview sin dejarla en el historial SQL. A continuación, con el preflight de 27 migraciones, centinela y cero inventario/outbox acreditado, activar la ventana corta:

```powershell
psql -X -v ON_ERROR_STOP=1 -d $adminDb -f scripts/u03-preview-v4-activate.sql
if ($LASTEXITCODE -ne 0) { throw 'V4_ROLE_ACTIVATION_FAILED' }
```

Ejecutar la campaña dirigida una sola vez. **Bloquear LOGIN en un `finally` de la terminal del propietario**, también ante error. Si la terminal se cierra abruptamente, ejecutar inmediatamente el comando de bloqueo por separado en otra terminal. No asumir que el `finally` del wrapper lo hace. Después del bloqueo, comprobar el ledger y lanzar el rollback; este SQL vuelve a bloquear LOGIN en su primera sentencia autocommit y rechaza la retirada si hay cualquier residuo de inventario o outbox:

```powershell
$campaignExit = 1
try {
  vercel.cmd env run -e preview -- powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/u03-preview-b4-owner.ps1 -MembershipRevocationOnly
  $campaignExit = $LASTEXITCODE
} finally {
  psql -X -v ON_ERROR_STOP=1 -d $adminDb -f scripts/u03-preview-v4-block.sql
  if ($LASTEXITCODE -ne 0) { throw 'V4_NOLOGIN_NOT_CONFIRMED' }
}
psql -X -v ON_ERROR_STOP=1 -d $adminDb -f scripts/u03-preview-v4-rollback.sql
if ($LASTEXITCODE -ne 0) { throw 'V4_ROLLBACK_BLOCKED_KEEP_LEDGER' }
if ($campaignExit -ne 0) { throw 'V4_CAMPAIGN_FAILED_REVIEW_LEDGER' }
```

Ejecutar los archivos con `-f` y **sin** `--single-transaction`: la primera sentencia de rollback debe confirmar `NOLOGIN` antes de la transacción que revisa residuos. Si el rollback falla, el rol queda sin LOGIN, se conservan grants/políticas y el ledger/UUIDs del run para reconciliar solo sus fixtures y recibo pendiente; no forzar un borrado. Repetir rollback tras acreditar inventario/outbox a cero es seguro. La contraseña del rol y la clave HMAC de prueba son distintas de Production; el rol general `rubik_audit_writer` sigue `NOLOGIN`.

Prueba local real: 27 migraciones N1 nuevas, centinela, instalación del rol y cuatro políticas; privilegios efectivos mínimos, denegación tras retirada por RPC con el mismo JWT aún vigente, recibo pendiente, bloqueo inmediato y rechazo de login, rollback fallido que conserva `NOLOGIN`, firma y reintento idempotente, limpieza por IDs, inventario/outbox cero, rollback repetido y rechazo sin centinela. El ensayo descubrió y corrigió una referencia SQL ambigua: la política de INSERT debe leer `audit_events.details`, no el `details` del outbox. No se aplicó SQL alojado.

## Motivo y vía existente

N1 `20261015145025` hace que la RPC `project_people(remove)` retire la membresía y en la misma transacción cree un recibo `member.withdraw` en `private.audit_outbox`. N1 `20261015201500` impide borrar el proyecto mientras el recibo esté `pending`. El producto ya dispone de `processAuditOutbox`: bloquea el recibo, comprueba el ámbito y la cadena HMAC, firma un evento, enlaza `receiptId` y marca el recibo `completed` en una transacción; el reintento devuelve la secuencia existente. Esa rutina usa `writerPool()`, que se cierra en Preview y depende del rol general `rubik_audit_writer`. No hay otra vía legítima desde Auth/Data API para firmar el recibo. Borrar directamente el recibo o desactivar el trigger/guard no satisface V-4.

El arnés reutiliza la misma rutina con `processAuditOutboxWithPool`, sin modificar la selección del pool del producto. `scripts/u03-preview-v4-receipt.mjs` acepta solo el ref exacto, un URL PostgreSQL directo de ese ref o su usuario de pooler con sufijo del ref, y el rol `rubik_preview_receipt_writer`. Exige TLS verificado, identidad Preview en el centinela, rol sin BYPASSRLS/SUPERUSER/INHERIT/CREATEROLE/CREATEDB, vigencia mayor de diez minutos, privilegios de recibo/evento y ausencia de permisos de inserción en resultados de proveedores e idempotencia. Solo procesa el `auditReceiptId` devuelto por la RPC para el proyecto UUID propio. En `finally`, si la respuesta se perdió, busca a lo sumo un recibo `member.withdraw` pendiente para ese proyecto propio, lo firma, limpia los IDs del ledger y comprueba Auth, inventario y outbox a cero. Un error de firma, ámbito o limpieza impide PASS.

## Configuración previa que debe revisar Juanma

1. En **el proyecto Supabase Preview con ref exacto**, comprobar centinela `preview/rhnnplewqsekrnaousyl`, 27 migraciones hasta `20261015210000`, cero inventario/outbox y rol de producto `rubik_audit_writer` todavía `NOLOGIN`. Aplicar únicamente [u03-preview-v4-role.sql](../scripts/u03-preview-v4-role.sql) contra ese ref. Es una configuración exclusiva de Preview, fuera de `supabase/migrations`; el propio SQL aborta si falla el centinela. Crea el rol **NOLOGIN** y concede únicamente SELECT/INSERT en `audit_events`, SELECT/UPDATE limitado en `audit_outbox`, ejecución de la función de ámbito y lectura del centinela. No concede acceso a Auth, tablas de membresía, proveedores ni borrado de recibos.
2. Tras revisar esos grants, activar ese rol **solo en Preview** con contraseña aleatoria exclusiva, introducida sin eco ni historial (por ejemplo, `psql` interactivo `\password rubik_preview_receipt_writer`); fijar `LOGIN VALID UNTIL` para una ventana corta, mayor de diez minutos, y comprobar `NOINHERIT NOBYPASSRLS NOSUPERUSER`. Nunca reutilizar la URL ni el anillo de Production. La clave HMAC de prueba se genera aleatoriamente en memoria por el wrapper al ejecutar V-4; no se escribe en archivo, Git, Vercel ni chat. No se requiere un servicio nuevo ni proveedores de pago; se usa la base Preview existente. Se requiere conectividad TLS de PostgreSQL desde el Windows del propietario y permiso de administración **solo para preparar el rol**. Si el pooler o TLS no permiten la conexión verificada, detenerse antes de fixtures.
3. Al terminar o vencer la ventana, mantener el rol sin capacidad de login (`NOLOGIN`); la caducidad corta limita incluso un cierre abrupto. No dejar un rol de firma permanentemente activo. Si el proceso termina con inventario u outbox no cero, conservar ledger/IDs, detener U03 y reconciliar solo esos IDs; nunca borrar un recibo `pending` administrativamente.

**Único comando de campaña V-4**, desde la raíz de este worktree en PowerShell Windows después de revisar y aprovisionar la configuración anterior:

```powershell
vercel.cmd env run -e preview -- powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/u03-preview-b4-owner.ps1 -MembershipRevocationOnly
```

El comando usa las claves Admin/Auth Preview ya custodiadas por DPAPI, ejecuta preflight exacto y pide **solo en terminal con entrada oculta** la URL del rol de recibos. La URL y clave HMAC viven en memoria del proceso; el `finally` limpia variables. No repite Data API 12/12 ni B-4, no abre Playwright, no altera Vercel Authentication ni llama a proveedores. El ledger marca ambas suites `SKIP_PRIOR_EVIDENCE` con sus run IDs; registra estados y UUIDs propios, sin URL, contraseña, clave, JWT o email. El último estado alojado conocido antes de esta campaña es el run de solo lectura `dba177cb-6cc9-4a1a-ba1e-88b9c3704130`: cero fixtures y cero outbox. **V-4 aún no se ha ejecutado.**

## Gates y límites

Pruebas locales dirigidas: destino Production/otro ref rechazados, credencial ausente, rol/URL no acotados, preflight sin capacidad, firma inválida, reintento idempotente, respuesta de retirada perdida y reconciliación antes de limpieza. La suite de unidad usa dobles de PostgreSQL; el ensayo aislado descrito arriba acredita instalación, privilegios y firma reales **solo localmente**. En Preview faltan TLS/privilegios del rol, V-4 y limpieza final. GitHub Actions no ejecuta jobs por facturación. Aunque V-4 pase, los casos alojados restantes de U03 y la pasada integral H1/H2 siguen pendientes.
