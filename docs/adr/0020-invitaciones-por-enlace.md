# ADR 0020 · Invitaciones a proyecto por enlace de un solo uso

**Estado:** propuesto en la rama `feat/invitaciones-proyecto`, sin integrar en `main`. **No está aplicado** en el Supabase alojado.
**Fecha:** 09/10/2026.
**Numeración:** se usa 0020 para no chocar con ADR que se estén redactando en paralelo (0010 está en #40; 0011 en adelante pueden usarse en otras ramas). Se puede renumerar al integrar.
**Depende de:** ADR 0003 (tenancy y Auth). Esa ADR exige cerrar el registro abierto antes de dar acceso a clientes y menciona las invitaciones como etapa posterior.

## Contexto

Hoy un titular solo puede dar acceso a otra persona insertando filas de membresía. La interfaz no lo permite. Para que haya varios clientes hace falta un camino con estas propiedades:

- controlado por la titularidad;
- con un rol concreto;
- revocable;
- sin enviar correos desde la plataforma, porque eso sería una acción hacia terceros sin autorización.

## Decisión

### Quién invita

Solo la **titularidad de la organización** (`private.is_org_owner`). Es el mismo criterio que ya aplican las políticas para añadir miembros a un proyecto.

La titularidad de un proyecto sin titularidad de la organización **no basta**.

### A qué rol

Solo `account-manager`, `analyst`, `client-approver` o `viewer`. **Nunca `owner`**.

- El rol se compara en minúsculas exactas.
- Cualquier otro valor da `22023`.

### Vínculo

Cada invitación queda ligada a un proyecto, un correo en minúsculas y un rol. Tiene estas propiedades:

- caduca a los 7 días;
- sirve una sola vez;
- se puede revocar.

### Token

- Se generan 244 bits aleatorios a partir de dos UUID v4, con PostgreSQL de serie y sin extensiones.
- Solo se guarda su SHA-256.
- El token en claro se devuelve **una única vez**, al crear la invitación, y la interfaz avisa de que no se volverá a mostrar.

### Entrega

**La plataforma no envía correos.** La persona titular copia el enlace y lo envía por sus propios medios.

### Aceptación

Solo funciona si se cumplen las tres condiciones:

- hay sesión iniciada;
- el correo de la cuenta coincide con el de la invitación;
- ese correo está **confirmado** (`email_confirmed_at`).

Un token desconocido, caducado, revocado, ya usado o de otra cuenta recibe siempre la misma respuesta (`P0002`). Así nadie puede averiguar qué invitaciones existen.

### Efecto de aceptar

- Se añade la membresía `member` en la organización. Si ya existía, no se toca.
- Se añade la membresía del proyecto con el rol invitado.
- Si la persona ya pertenece al proyecto y acepta una invitación **nueva y abierta**, la aceptación se rechaza (`23505`) y no cambia su rol. Un enlace **ya usado** recibe la respuesta genérica, como uno desconocido.
- Nunca se concede ni se cambia la titularidad de la organización.

### Límites

- Una sola invitación abierta por correo y proyecto.
- Como máximo 50 abiertas por proyecto.
- Las caducadas se marcan como revocadas al crear una nueva para el mismo correo.

### Almacenamiento

La tabla es `private.project_invitations` y se accede solo por RPC:

- tiene RLS activado, sin políticas y sin privilegios directos;
- las RPC (`public.project_invitations` y `public.accept_project_invitation`) son `SECURITY INVOKER` y delegan en funciones `SECURITY DEFINER` del esquema privado, con `search_path` vacío.

### Interfaz

- **`/organizaciones`:** enlace «Invitar personas» por proyecto, visible solo para la titularidad.
- **`/proyectos/<org>/<proyecto>/invitaciones`:** crear, listar y revocar.
- **`/invitacion/<token>`:** aceptar. No muestra el proyecto, el rol ni el correo antes de aceptar.
- **`/acceso?siguiente=/invitacion/<token>`:** solo admite volver a un enlace de invitación con forma válida.

## Cuentas nuevas y existentes

- **Cuenta existente:** la persona abre el enlace, entra con su cuenta y pulsa «Aceptar invitación».
- **Cuenta nueva:**
  1. La persona se registra con **ese** correo y confirma el correo de alta (Supabase Auth).
  2. Vuelve a abrir el enlace, entra y acepta.

  El registro sigue la política vigente de ADR 0003.

## Riesgos aceptados y mitigaciones

- **El token viaja en la ruta de la URL** y puede quedar en registros del servidor y en el historial del navegador. Lo mitiga que el enlace solo sirve con el correo confirmado al que va dirigido, una sola vez y durante 7 días, y que es revocable.
- **«Ya perteneces» revela que la persona es miembro.** Esa respuesta solo se da a la propia persona invitada, con su sesión y su correo.

## Fuera de alcance

- Envío de correos desde la plataforma.
- Gestionar o expulsar miembros desde la interfaz. Retirar a personas que no son titulares se cubre después en [ADR 0021](0021-retirar-acceso-e-inventario.md).
- Cambiar roles.
- Cerrar el registro abierto, que es una decisión del propietario en Supabase Auth según ADR 0003.

## Pruebas

- **pgTAP:** `supabase/tests/project_invitations.test.sql` (50). Cubre:
  - privilegios;
  - quién puede invitar;
  - roles inválidos, incluidos `owner`, `OWNER` y `admin`;
  - el token solo se guarda como hash;
  - una invitación abierta por correo;
  - otra cuenta, cuenta no confirmada, caducada, revocada, ya usada y sin sesión;
  - escalado: la persona invitada nunca pasa a ser titular, conserva sus roles previos y no gana acceso a otros proyectos.
- **Vitest:** `tests/invitations.test.ts` comprueba validación previa, códigos fijos y respuestas mal formadas.
- **e2e:** `e2e/invitations.spec.ts`, en CI con correo local:
  - páginas a 360, 390 y 1280 px con accesibilidad y desbordamiento;
  - flujo con cuenta nueva y con cuenta existente;
  - otra cuenta rechazada;
  - un solo uso;
  - revocación.

## Rollback

```sql
drop function if exists public.accept_project_invitation(text);
drop function if exists public.project_invitations(uuid, text, jsonb);
drop function if exists private.accept_project_invitation(text);
drop function if exists private.project_invitation_command(uuid, text, jsonb);
drop table if exists private.project_invitations;
```

Las membresías creadas con invitaciones aceptadas se conservan: son filas normales de tenancy.
