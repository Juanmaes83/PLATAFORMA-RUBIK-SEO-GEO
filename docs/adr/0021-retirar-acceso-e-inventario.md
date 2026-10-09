# ADR 0021 · Retirar el acceso a una persona e inventario de datos del proyecto

**Estado:** integrado en `main@ac70b1d` (PR #59). **No está aplicado** en el Supabase alojado. Ampliado por la migración `20261012110000`, que suma al inventario las propiedades Google de OpenSEO (#60).
**Fecha:** 09/10/2026.
**Depende de:** ADR 0003 (tenancy), ADR 0020 (invitaciones) y la decisión **D3** de Juanma en [RETENCION-Y-BORRADO](../RETENCION-Y-BORRADO.md): una baja es retirar el acceso, sin borrar la cuenta.

## Contexto

- Las políticas RLS ya permitían a la titularidad de la organización quitar membresías, pero no había interfaz: retirar a alguien exigía una acción alojada del administrador.
- Borrar la cuenta en Auth hoy falla si la persona guardó resultados, importaciones, trabajos o reservas (§1.1 de RETENCION-Y-BORRADO). D3 evita ese camino.
- Para responder a una solicitud de acceso hacía falta saber qué guarda un proyecto sin abrir la base de datos.

## Decisión

### Retirar el acceso (`/proyectos/<org>/<proyecto>/personas`)

- **Quién:** solo la titularidad de la organización (`private.is_org_owner`), como en las invitaciones.
- **A quién:** a cualquier persona del proyecto **salvo titulares** del proyecto o de la organización (`23514`). Así nadie se queda fuera por error ni cambia la titularidad, y nadie se retira a sí mismo desde aquí.
- **Efecto, en una sola transacción:**
  1. se borra su membresía del proyecto;
  2. si era su último proyecto en la organización, se borra también su membresía `member` de la organización;
  3. se revocan sus invitaciones abiertas a ese proyecto, para que no pueda volver con un enlace pendiente.
- **Lo que no hace:** no borra la cuenta de Auth, ni filas que la persona creó (resultados, importaciones, auditoría), ni cambia roles de nadie más.
- **Confirmación:** la interfaz exige marcar una casilla antes de enviar.
- **Auditoría firmada:** después de retirar el acceso se añade el evento `member.withdraw` con el **UUID** de la persona (nunca su correo) y el efecto. Retirar el acceso va primero porque es lo que protege el proyecto: si la firma no está configurada, el acceso se retira igual y la pantalla avisa de que no quedó registro firmado.
- **Listado:** muestra correo, rol en el proyecto, rol en la organización y fecha. El correo solo lo ve la titularidad de la organización, que es quien invita.

### Inventario de datos (`/proyectos/<org>/<proyecto>/datos`)

- **Quién:** solo la titularidad de la organización.
- **Qué:** recuentos (y primera y última fecha cuando aplica) de las tablas del inventario de E4: auditoría, resultados, importaciones, membresías, invitaciones abiertas y cerradas, trabajos y conexiones de OpenSEO, propiedades de GSC/Bing, propiedades Google asociadas en OpenSEO (desde `20261012110000`), presupuestos y movimientos de consumo.
- **Solo lectura:** no muestra contenido ni permite borrar. Remite a la exportación para el detalle.

### Almacenamiento y acceso

Sin tablas nuevas. Dos funciones `SECURITY DEFINER` en `private` con `search_path` vacío y sus envoltorios `SECURITY INVOKER` en `public` (`project_people`, `project_data_inventory`), ejecutables solo por `authenticated`. Migración `20261012100000`.

## Alternativas descartadas

- **Borrar con RLS desde el cliente:** son varias filas en dos tablas más las invitaciones; una RPC lo hace atómico y con un único punto de autorización.
- **Permitir retirar titulares:** exigiría reglas de transferencia de titularidad; queda fuera.
- **Guardar el correo en la auditoría:** la auditoría es inmutable y D2 sigue pendiente; basta el UUID.

## Pruebas

- **pgTAP** `supabase/tests/project_people.test.sql` (43): privilegios, quién lista y quién retira, titulares protegidos, referencias inválidas, salida de la organización solo con el último proyecto, revocación de invitaciones, la cuenta se conserva, la invitación revocada no devuelve el acceso, otras organizaciones e inventario.
- **Vitest** `tests/project-people.test.ts`: validación previa, códigos fijos y respuestas mal formadas.
- **e2e** en `e2e/invitations.spec.ts`: páginas a 360, 390 y 1280 px con accesibilidad y desbordamiento (capturas 29–32), enlaces desde `/organizaciones` y flujo completo de retirada.

## Rollback

`docs/rollback/project-people-rollback.sql`. Se ejecuta antes que el de ADR 0020.
