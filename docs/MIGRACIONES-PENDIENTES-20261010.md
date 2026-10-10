# Paquete de migraciones pendientes — 10/10/2026

Este documento prepara la aplicación alojada de las migraciones integradas después del último
checkpoint confirmado. **No acredita que se hayan aplicado** y no autoriza conexiones, lecturas
Google, gasto, cambios de flags ni el modo `project`.

## Evidencia y límite

El último historial alojado documentado contiene exactamente estas nueve versiones:

```text
20260928120000
20260928150000
20261007120000
20261007150000
20261009071705
20261009120000
20261009150000
20261009170000
20261009180000
```

Ese dato procede de la comprobación anterior del propietario. Debe volver a verificarse con
`migration list --linked` inmediatamente antes de cualquier escritura. Esta revisión no accedió
al Supabase alojado.

## Paquete esperado

Si, y solo si, el historial remoto coincide exactamente con las nueve versiones anteriores, el
`dry-run` debe proponer estas siete, en este orden:

| Orden | Versión | Unidad |
|---:|---|---|
| 1 | `20261010090000` | presupuesto y ledger de proveedor |
| 2 | `20261010150000` | idempotencia, resumen y bloqueo por sobrecoste |
| 3 | `20261010160000` | asociación GSC/GA4 por conexión OpenSEO |
| 4 | `20261012090000` | invitaciones de proyecto de un solo uso |
| 5 | `20261012100000` | personas e inventario del proyecto |
| 6 | `20261012110000` | inventario ampliado con asociaciones Google |
| 7 | `20261012120000` | capturas Google firmadas e idempotentes |

El resultado final esperado sería **16 versiones sincronizadas**. No usar `--include-all`,
`migration repair`, ni cambiar timestamps para forzar una divergencia.

## Ejecución controlada por el propietario

Desde un clon limpio del repositorio, en PowerShell:

```powershell
git switch main
git pull --ff-only
git status --short
npx --yes supabase@2.118.0 link --project-ref yvdgmklgwlshizzgefpv
npx --yes supabase@2.118.0 migration list --linked
npx --yes supabase@2.118.0 db push --linked --dry-run
```

`git status --short` debe quedar vacío. Antes de la escritura debe existir una copia de seguridad
recuperable del proyecto alojado. Solo después de comparar el resultado con la tabla anterior:

```powershell
npx --yes supabase@2.118.0 db push --linked
npx --yes supabase@2.118.0 migration list --linked
npx --yes supabase@2.118.0 db advisors --linked --type security --level info
```

### Condiciones de parada

No ejecutar `db push` y guardar la salida si ocurre cualquiera de estos casos:

- el destino no es `yvdgmklgwlshizzgefpv`;
- el historial remoto no contiene exactamente las nueve versiones de partida;
- el dry-run propone menos, más o distintas migraciones, o cambia el orden;
- Git no está limpio o `main` no coincide con `origin/main`;
- no existe una copia de seguridad verificable;
- Supabase informa de una dependencia, conflicto, reparación o migración parcialmente aplicada.

No pegar contraseñas, tokens, claves, URLs con secretos ni salidas sensibles en GitHub o chat.

## Comprobación posterior, sin activar servicios

Tras una aplicación correcta, `migration list --linked` debe mostrar las 16 versiones en Local y
Remote. En el editor SQL del proyecto se puede comprobar la estructura, sin leer secretos ni
activar nada:

```sql
select n.nspname as schema_name, c.relname as table_name, c.relrowsecurity as rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'private'
  and c.relname in (
    'provider_budgets',
    'provider_spend',
    'openseo_google_properties',
    'project_invitations',
    'google_captures'
  )
order by c.relname;

select n.nspname as schema_name, p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where (n.nspname, p.proname) in (
  ('public', 'provider_budget'),
  ('public', 'openseo_google_property'),
  ('public', 'project_invitations'),
  ('public', 'accept_project_invitation'),
  ('public', 'project_people'),
  ('public', 'project_data_inventory'),
  ('public', 'google_capture')
)
order by n.nspname, p.proname;
```

Esperado: cinco tablas privadas con RLS en `true` y las siete RPC públicas presentes. Después se
revisa la salida de los advisors. Un aviso debe evaluarse; no se borra ni se ignora para conseguir
un resultado artificialmente verde.

Esto solo valida **esquema aplicado**. No valida conexión real, lectura GSC/GA4, captura real,
aislamiento alojado entre dos cuentas ni recuperación.

## Rollback

Los rollback son operaciones destructivas y requieren aprobación concreta, copia de seguridad y
revisión de los datos que se perderán. El orden completo es el inverso:

1. `google-captures-rollback.sql`; marcar `20261012120000` como reverted.
2. Marcar `20261012110000` como reverted; su función de inventario se retira con el siguiente paso.
3. `project-people-rollback.sql`; marcar `20261012100000` como reverted.
4. `project-invitations-rollback.sql`; marcar `20261012090000` como reverted.
5. `openseo-google-properties-rollback.sql`; marcar `20261010160000` como reverted.
6. `provider-spend-controls-rollback.sql`; marcar `20261010150000` como reverted.
7. `provider-budget-rollback.sql`; marcar `20261010090000` como reverted.

No ejecutar solo el rollback de asociaciones Google mientras sigan instalados el ledger de capturas
o las funciones de inventario que dependen de él. Los resultados firmados de Google permanecen en
`public.provider_results`; se pierden las asociaciones activas, su historial operativo y el ledger
de idempotencia. Las invitaciones históricas, presupuestos y consumo también se pierden cuando se
eliminan sus tablas.

## Siguiente validación

Después de aplicar y verificar el esquema, conservar `legacy` y las lecturas Google apagadas. El
orden posterior es:

1. comprobar la interfaz y el aislamiento alojado sin llamar a proveedores;
2. crear la conexión/asociación de Sarah solo con consentimiento del propietario;
3. validar una lectura real acotada con presupuesto y autorización específicos;
4. decidir por separado cualquier activación del modo `project`.

Cada paso debe registrar por separado código integrado, esquema aplicado, conexión verificada y
validación humana.
