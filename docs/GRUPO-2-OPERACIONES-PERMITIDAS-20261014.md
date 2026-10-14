# Grupo 2 — operaciones permitidas dentro de un cliente

**Estado:** integración local 54/54 superada según salida aportada por el propietario; CI y `npm run verify` del PR pendientes. Base `main@bea764671c65e84bd6efcc749e7a66d40a21f1fe`. No se ejecutó código contra la base alojada, no se modificaron políticas, proveedores, variables ni despliegues.

## Evidencia posterior — integración local superada (14/10/2026)

El propietario ejecutó `npm run test:integration` en Windows, rama local `test-local-pr82`, con Supabase local activo (`127.0.0.1:54321`). Resultado aportado: **10 archivos PASS, 54 pruebas PASS**, incluida `tests/integration/tenancy.integration.test.ts` (**14/14 PASS**, cuatro nuevos casos). Duración 30,97 s. No es ejecución de GitHub Actions, ni verifica el Supabase alojado. **Queda pendiente** `npm run verify` de este SHA y una revisión global adicional de funciones de importación, exportación, conectores y consumo antes de declarar el alcance completo cerrado.

## Auditoría de alcance

- Core `src/lib/access.ts`: la interfaz construye el actor con la pertenencia real y delega en `platform.authorize`; no interpreta parámetros de URL ni cookies como roles. La autorización UI por sí sola no sustituye controles del servidor y RLS.
- SQL `20260928120000_core_9_1_tenancy.sql`: RLS con SELECT de proyecto para sus miembros; edición de datos descriptivos para propietarios de proyecto; organización administrada por titular; miembros de proyecto administrados por titular de organización. Funciones privadas fijan el actor con `auth.uid()`.
- `src/lib/invitation-actions.ts`, `src/lib/invitations.ts`: la pertenencia previa sirve para localizar proyecto; RPC `project_invitations` decide quién puede listar, invitar y revocar (propietario de organización). La aceptación verifica dirección confirmada.
- `src/lib/people-actions.ts`, `src/lib/project-people.ts`: `project_people` aplica autorización de retirada en SQL. La retirada no borra cuentas y genera auditoría posterior.
- **Límite:** una llamada que recibe un UUID o un slug manipulable debe quedar protegida en cada operación RPC/RLS, no solo por la navegación.

## Pruebas incorporadas

En `tests/integration/tenancy.integration.test.ts` se añadieron cuatro casos usando las cuatro identidades ficticias existentes:
1. El analista no puede promover su pertenencia organizativa, invitar como propietario mediante DML ni expulsar al propietario.
2. No puede crear o revocar `project_members` ni elevar su propio rol a `owner`.
3. El titular crea el segundo proyecto A2; el analista con acceso a A1 no puede verlo, modificarlo ni leer su membresía; el titular de otra empresa tampoco.
4. Las RPC reales `project_invitations` y `project_people` permiten `list` al titular autorizado, rechazan al analista (código esperado `42501`) y al titular de otra organización.

Todas las inserciones son ficticias y se limpian con el teardown de la suite; **únicamente ejecutar contra Supabase local**. No se han alterado permisos de producto por no haberse demostrado una vulnerabilidad.

## Validación que falta

- `npm run test:integration` con Supabase local y migraciones aplicadas; comprobar explícitamente los cuatro nuevos casos y ajustar solo según errores reales. **No aprobado hasta PASS.**
- `npm run verify` (lint, tipos, unitarias, build), y cuando el bloqueo de facturación se resuelva CI, e2e.
- Revisar posteriormente RPCs de importaciones/exportaciones, conectores y presupuestos contra su matriz Core sin introducir nuevas facultades.
- Aislamiento alojado real con dos cuentas sigue pendiente y requiere el procedimiento autorizado de `docs/AISLAMIENTO-ALOJADO-GUION.md`; no se ejecuta sobre producción en esta PR.

## Riesgos

- El propietario de organización puede administrar membresías de sus proyectos por diseño; no confundirlo con permisos de un analista.
- La visibilidad de A2 debe depender del vínculo `project_members`, no solamente de `organization_members`.
- Las comprobaciones `42501` de RPC son una expectativa basada en los contratos actuales y requieren ejecución empírica. Un fallo de tests no autoriza a ampliar el privilegio.
- GitHub Actions tiene un bloqueo operativo conocido de facturación. Vercel READY no sustituye integración.
