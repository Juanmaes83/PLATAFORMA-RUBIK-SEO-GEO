# N1 · respaldo lógico y restauración aislada del destino configurado

**Corte:** 16/10/2026, 20:43 Europe/Madrid. **Origen:** proyecto `yvdgmklgwlshizzgefpv`, leído con Supabase CLI autenticada `2.118.0`; PostgreSQL origen `17.6`. El [expediente de ventana](../N1-VENTANA-ALOJADA-20261016.md) registra que `/api/salud` de Production publicó ese ref como destino configurado; esta prueba de copia **no** valida la conexión SQL efectiva de Production ni vuelve a comprobar el SHA desplegado. `main` remoto avanzó a `be65e4456c1a1e08d4bb2c32d8b5eae51fae289a` (PR #120 y #121 fusionadas). El dry run de abajo se ejecutó **solo** desde el worktree limpio `b6555eaa8190ed8668c501813fda01e06c75163c`, anterior a #120.

## Cobertura real del respaldo

La CLI produjo siete componentes SQL sin publicar su contenido: esquema `public,private` (116 053 bytes), esquema `storage` (104 373), esquema `auth` (53 247), datos de `public,private,auth,storage` en **un solo `pg_dump`** (34 387), roles (431), esquema `supabase_migrations` (887) y datos del historial (124 445). El `pg_dump` de datos contiene 48 secciones `COPY`. Los esquemas, roles e historial se capturaron en operaciones separadas, así que **no hay un snapshot global único** entre los siete componentes. No se descargaron valores de variables de entorno, claves de firma, secretos Vault ni objetos binarios de Storage. La consulta agregada de solo lectura a `storage.objects` devolvió 0 objetos en este corte; ello no sustituye una copia de objetos si el estado cambia. [Supabase documenta](https://supabase.com/docs/guides/platform/backups) que una copia de base de datos cubre metadatos de Storage, no los archivos binarios.

Solo permanecen dos archivos **cifrados con DPAPI CurrentUser** en `%TEMP%\rubik-n1-candidate-20261016\`:

| Artefacto local | Tamaño | SHA-256 del cifrado | Contenido |
| --- | ---: | --- | --- |
| `candidate-logical.zip.dpapi` | 49 414 bytes | `8AD839DA2B76197DAF1D62C85F0CCC3925C4BE5EC7D5A143BA9ABC523C8EF170` | Los cinco componentes de esquema, datos y roles |
| `candidate-history.zip.dpapi` | 22 294 bytes | `EEAD39B6C838BD1A0015E7D79E4401057308117A63E0BD993F06C06900212814` | Esquema y datos de `supabase_migrations` |

Se comprobó el descifrado en memoria y el SHA-256 de las 5+2 entradas; cero discrepancias. Los SQL y ZIP sin cifrar se borraron por rutas literales verificadas. **DPAPI exige el mismo perfil de Windows y no constituye custodia portable ni fuera del equipo.** `%TEMP%` puede limpiarse; antes de cualquier ventana de migración hay que trasladar un respaldo cifrado a custodia operativa aprobada y repetir una restauración desde esa copia. No se subió contenido de datos a Git ni al chat.

## Ensayo de restauración

Destino exclusivamente local `rubik-n1-candidate-restore-20261016`, PostgreSQL 17, API `127.0.0.1:50321`, DB `127.0.0.1:50322`, sin migraciones ni seed del repositorio. Se comprobó la identidad del contenedor y el puerto antes de cada `psql`. Cada componente se aplicó con `ON_ERROR_STOP=1` y `--single-transaction`.

- Esquema `public,private`: **PASS**. Esquema `storage`: **PASS**. El esquema `auth` quedó archivado; para este ensayo se utilizó el esquema Auth inicializado por Supabase local y la copia de sus datos cargó sin errores. No se probó sustituir un Auth alojado por el esquema exportado.
- Datos de las cuatro áreas: **PASS**; 48/48 secciones `COPY`, 38/38 filas frente a los conteos del volcado, cero discrepancias y cero restricciones `public/private/auth/storage` sin validar. No se imprimió ninguna fila.
- Roles: primer intento local `42501` con `postgres` sin superuser; el segundo encontró ausente el rol **gestionado por Realtime** porque el stack mínimo no inició ese servicio (`42704`). Se creó únicamente ese rol `NOLOGIN` en la base aislada y el volcado de roles restauró **PASS** como `supabase_admin`. Esto es una dependencia del entorno de ensayo, no una modificación del origen.
- Historial: esquema y datos restaurados **PASS** en una segunda instancia local aislada; 16 versiones, última `20261012120000`, coincidentes con `migration list` remoto. Este componente se capturó después del volcado principal, sin corte transaccional común.
- Al terminar se ejecutó `supabase stop --project-id rubik-n1-candidate-restore-20261016 --no-backup`; el volumen local con datos copiados quedó eliminado. No se paró ningún otro stack.

**Resultado:** la copia lógica fue restaurable en el ensayo PostgreSQL/Supabase local dentro del alcance indicado. **No se acredita todavía un respaldo operativo completo para Production:** falta custodia duradera y portable, restauración desde esa custodia, verificación de Auth/Storage/Realtime como servicios, secretos y contraseñas por canal seguro y un punto de corte consistente entre componentes. [La guía oficial de `db dump`](https://supabase.com/docs/reference/cli/supabase-db-dump) distingue esquema, datos y roles; la [guía de migración](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) trata el historial por separado. Esta evidencia no autoriza aplicar migraciones.

## Dry run exacto de las 11 N1 desde `b6555ea`

Desde `s2-consent/test-results/n1-hosted-audit` limpio en `b6555eaa8190ed8668c501813fda01e06c75163c` se ejecutó:

```powershell
npx --yes supabase@2.118.0 db push --dry-run --skip-vault --project-ref yvdgmklgwlshizzgefpv
```

La CLI respondió `DRY RUN: migrations will not be pushed`, `dryRun:true`, `roles:[]`, `seeds:[]`, y **solo** estas versiones, en este orden:

1. `20261012130000_google_recovery_state.sql`
2. `20261015115750_membership_consent.sql`
3. `20261015145025_s1_trusted_audit_writer.sql`
4. `20261015170000_s1_import_audit_outbox.sql`
5. `20261015171000_s1_import_restore_boundary.sql`
6. `20261015172000_s1_import_receipt_identity.sql`
7. `20261015180000_s1_trusted_provider_results.sql`
8. `20261015183000_s1_provider_erase_outbox.sql`
9. `20261015190000_s1_provider_rpc_boundary.sql`
10. `20261015201500_s1_pending_receipt_delete_guard.sql`
11. `20261015210000_s1_provider_capture_receipts.sql`

`migration list` posterior confirmó 16 remotas hasta `20261012120000` y esas 11 locales pendientes. No propuso N2, seed ni roles. El dry run confirma selección y orden; **no ejecuta ni valida el SQL de las migraciones** ni detecta por sí solo todo drift físico. La ventana debe detenerse si cambia el ref, la lista, los hashes o el esquema. En particular, no usar el `main` actual para un `db push` N1: contiene también migraciones N2 y F-OPS-2.

**Límites respetados:** ninguna migración, `db push` real, cambio de roles/grants o escritura en Supabase alojado; ninguna llamada a proveedores, dato de cliente o secreto publicado; ningún cambio en Production ni FLOOR PLAN. H1 continúa parcial y H2 bloqueado.
