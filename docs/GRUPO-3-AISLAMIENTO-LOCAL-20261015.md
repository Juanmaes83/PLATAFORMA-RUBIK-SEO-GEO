# Grupo 3 — matriz de aislamiento multicliente validada en local (15/10/2026)

**Estado:** IMPLEMENTACIÓN LOCAL VALIDADA · AISLAMIENTO ALOJADO PENDIENTE.
Base: `main@506ea91` (PR #82). Rama: `test/group3-isolation-matrix-20261015`. Sin cambios de esquema, RLS, RPC ni configuración; solo pruebas y documentación. Nada se ejecutó contra Supabase alojado, Vercel de producción ni proveedores.

## Qué se añade

| Archivo | Tipo | Qué cubre |
|---|---|---|
| `tests/integration/isolation-matrix.integration.test.ts` | Vitest + Supabase local (Data API, clave publicable) | 14 casos: matriz completa de identidades × las 13 RPC expuestas, roles en tablas, cabeceras de perfil, JWT falsificado, GraphQL |
| `supabase/tests/tenancy_surface.test.sql` | pgTAP | 14 invariantes sobre **todo** el catálogo `public`/`private`, no solo los objetos de cada migración |

### Identidades

`ownerA` (titular de A: A1 y A2) · `ownerB` (titular de B: B1) · `am` account-manager de A1 · `an` analyst de A1 · `vw` viewer de A1 · `ca` client-approver de A1 · `a2v` viewer solo de A2 · `out` autenticado sin pertenencia y con `user_metadata` falsificado · anónimo.

### Casos negativos cubiertos

| Escenario del encargo | Prueba |
|---|---|
| Anónimo invocando RPC administrativas | Las 13 RPC + `accept_project_invitation`, con UUID real y aleatorio: `42501 permission denied for function` (PostgREST no llega a ejecutar la función) |
| Autenticado sin membresía | `out` → `42501` en todas las RPC; tablas vacías |
| Falsificar `user_metadata` | `out` reescribe su metadata con `auth.updateUser`, refresca el JWT, se comprueba que el claim viaja en el token y que **nada** lo usa (tablas, RPC, alta en `project_members`) |
| Analyst/account-manager/viewer/client-approver fuera de su matriz | Todas las RPC owner-only devuelven `42501`; AM no borra, no gestiona personas ni edita el proyecto; viewer y client-approver no escriben ni borran |
| Positivo controlado | AM crea un borrador de importación en A1 (rol con `draft`); solo `ownerA` lo borra |
| Owner de B consultando objetos de A | `ownerB` → `42501` en RPC, vacío en tablas, también con el UUID exacto |
| Miembro de A1 accediendo a A2 | am/an/vw/ca → `42501` en todas las RPC sobre A2; `a2v` no ve filas de A1 |
| Manipulación de `project_id` / `organization_id` / UUID | Importación en A2 y B1 → `42501`; A1 con organización B y B1 con organización A → error de FK compuesta |
| Llamadas directas a PostgREST | `fetch` crudo con `Accept-Profile: private` / `Content-Profile: private` → `406 PGRST106`, también como owner |
| JWT manipulado | Payload con `sub` de `ownerA` y firma ajena o vacía → `401`, sin datos |
| Acceso a esquemas privados | Además de lo anterior, pgTAP: `anon` sin `USAGE` en `private`; `authenticated` sin privilegios sobre tablas privadas |
| Filtración de existencia por diferencias en errores | Para cada RPC y para `ownerB`, `out` y `vw`: el error con un proyecto real ajeno es **idéntico** (code, message, details, hint) al de un UUID inexistente. Igual para tokens de invitación mal formados frente a desconocidos (`P0002`) |
| GraphQL | Anónimo y `out` no obtienen nada de A (en local `pg_graphql` está deshabilitado; la prueba sigue siendo válida si se habilita) |
| Conexiones, informes y presupuestos de otro cliente | `openseo_connection`, `openseo_google_property`, `webmaster_property`, `google_capture`, `google_recovery_state`, `provider_budget`, `project_data_inventory` incluidos en la matriz |

### Invariantes de catálogo (pgTAP)

Ninguna función de la aplicación ejecutable por `anon` ni por `PUBLIC`; toda función `SECURITY DEFINER` con `search_path` vacío (excepción documentada: `rls_auto_enable`, solo owner); toda RPC pública es un envoltorio `SECURITY INVOKER`; **lista cerrada de RPC expuestas** (añadir una obliga a ampliar la matriz); RLS en todas las tablas; `anon` sin privilegios de tabla ni columna; `authenticated` sin `TRUNCATE/REFERENCES/TRIGGER`; políticas solo para `authenticated`; toda política `UPDATE` con `WITH CHECK`; ni políticas ni funciones leen `user_metadata`.

## Evidencia (Windows, Supabase local 2.118.0, 15/10/2026)

| Comando | Resultado |
|---|---|
| `npx --yes supabase@2.118.0 test db` | **532/532 PASS** (19 ficheros; 518 previos + 14 nuevos). No reinicia la base: cada fichero es una transacción con `rollback` |
| `npm run test:integration` | **71/71 PASS** (11 ficheros; 57 previos + 14 nuevos) |
| `npm run verify` | exit 0: Core pin `2aaf127`, secretos (356 ficheros), lint, TypeScript, **374/374** unitarias/UI, build |

**Prueba de mutación** (para no confundir «pasa» con «detecta»): se concedió temporalmente `EXECUTE` a `anon` sobre `project_data_inventory` en la base local. Fallaron `tenancy_surface` («anon cannot execute any application function»), una prueba pgTAP previa («anon cannot read the inventory») y el caso anónimo de la matriz. Se revocó el permiso y se comprobó `has_function_privilege('anon', …) = false`.

## Hallazgos

No se ha encontrado ninguna vulnerabilidad explotable en local. Observaciones para revisión humana:

1. **Riesgo residual aceptado por diseño (ADR 0004):** cualquier miembro del proyecto, incluido viewer, puede añadir filas a `audit_events` por la Data API con su propio rol (la app lo necesita para auditar denegaciones y `member.withdraw`). Una fila forjada no tiene HMAC válido y la verificación la marca (`SIGNATURE`, ya probado en `provenance.integration.test.ts`), pero es inmutable y solo desaparece con el proyecto: un miembro malicioso puede dejar permanentemente la cadena «no válida». Mitigación posible (requiere decisión): mover el alta de auditoría a una RPC que firme en servidor o restringir la política de inserción a eventos con `outcome` y `action` permitidos por rol.
2. **Baja:** un titular puede dar de alta en su organización a cualquier `user_id` existente sin consentimiento del usuario (`organization_members` INSERT solo exige `is_org_owner`). No expone datos del usuario añadido y requiere conocer su UUID; el flujo de producto usa invitaciones. Valorar si conviene restringir el INSERT directo a las invitaciones.
3. Cobertura ya existente que no se duplica: restauración cruzada y export manipulado (`restore*.integration.test.ts`), reintento idempotente de captura (`google-capture.integration.test.ts`), proyectos con el mismo owner (`provenance`, `openseo-connections`).

## Qué falta para cerrar el Grupo 3

- **Fase B del protocolo alojado** (`docs/GRUPO-3-PROTOCOLO-AISLAMIENTO-ALOJADO-20261014.md`, PR #84): dos cuentas reales del propietario, datos ficticios y limpieza verificada. Requiere al propietario.
- La ruta `/proyectos/<org>/<proyecto>/exportar` devuelve 404 a quien no tiene `export-data` (código revisado); falta una prueba HTTP de la ruta con sesión, que necesita `next start` con el stack local.
- CI: GitHub Actions sigue bloqueado por facturación; toda la evidencia anterior es local.
