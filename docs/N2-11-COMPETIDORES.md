# N2-11 · Competidores (primer incremento funcional)

Estado: **implementado y probado en local; no operativo en ningún entorno alojado.** PR Draft desde
`claude/n2-11-competitor-intelligence-v1`. Matriz de herramientas y costes:
[Fase A](N2-11-COMPETIDORES-FASE-A-20261016.md).

## Qué puede hacer un usuario

En `/proyectos/[tenantId]/[projectId]/competidores` (pestaña «Competidores» del proyecto):

- Añadir un competidor escribiendo un dominio o una URL: se guarda solo el dominio normalizado
  (sin esquema, ruta ni `www.`, IDN en punycode). Se rechazan IP, `localhost`, dominios reservados,
  credenciales en la URL y esquemas no http(s). **La plataforma nunca visita el dominio.** Repetirlo
  (aunque se escriba distinto) abre el existente.
- Editar nombre, descripción y tipo (directo/indirecto). El dominio es inmutable.
- Registrar observaciones del competidor y del propio sitio: métrica, valor o «no disponible en la
  fuente», método (observado/declarado), fuente, fecha, país, idioma, dispositivo, referencia (texto,
  no se abre) y notas. No se puede editar un valor: se registra otra observación.
- Ver la comparación con su sitio por métrica: diferencia solo si es comparable; si no, el motivo
  (fuentes, método, mercado, dispositivo o periodo). Una diferencia sin verificar se marca
  «pendiente de verificación».
- Ver el historial por serie (fuente+método+mercado) en la ficha del competidor; con una sola
  medición se dice que no hay evolución.
- Verificar una observación (titular o aprobador del cliente), archivar/restaurar (titular o gestor),
  borrar observaciones o competidores (titular, con confirmación).

## Permisos (Core → base de datos)

| Operación | Acción Core | Roles | Barrera en BD |
|---|---|---|---|
| Leer | `read` | todos los miembros del proyecto | política SELECT `is_project_member` |
| Añadir / editar / observar | `draft` | owner, account-manager, analyst | políticas INSERT/UPDATE + grants por columna |
| Archivar / restaurar | `review-action` | owner, account-manager | trigger BEFORE (`42501`) |
| Verificar | `approve-fact` | owner, client-approver | política UPDATE + trigger (solo unverified→verified) |
| Borrar | `delete-data` | owner | política DELETE |

Aislamiento: claves compuestas `(project_id, organization_id)` y `(competitor_id, project_id)`;
cada consulta de la aplicación se ata además al id del proyecto. Un id de otro proyecto u
organización responde 404 / no encontrado.

## Auditoría (S1)

Cada cambio deja un recibo en `private.audit_outbox` **en la misma transacción** (triggers
`SECURITY DEFINER`, rol vivo del proyecto, sin JWT INSERT ni HMAC en el navegador). Tras el cambio,
el servidor firma los recibos pendientes de ese actor y proyecto con el escritor de confianza
(`src/lib/competitors/audit.ts` → `processAuditOutbox`). Si la firma falla, el cambio queda guardado
y el recibo pendiente (aviso visible); bloquea el borrado del proyecto (#106) y lo completa el
drenaje del operador. Sin claves de firma o sin escritor, la edición se desactiva.

Acciones: `competitor.add|update|archive|restore|erase`, `competitor.observation.add|verify|erase`.
Las cascadas (borrar competidor o proyecto) no generan recibos huérfanos.

## Migración y rollback

- `supabase/migrations/20261016100000_n2_11_competitors.sql` (nueva, local).
- Rollback de contención: `supabase/rollbacks/20261016100000_n2_11_competitors.sql` retira grants y
  políticas (RLS sigue activa sin políticas = denegar), conserva datos y recibos y la restricción
  ampliada del outbox. Ensayado en local dentro de una transacción (0 grants, 0 políticas, RLS on).
  Borrar las tablas no forma parte del rollback: exige recibos firmados, exportación y decisión del
  propietario.
- **No aplicada al proyecto alojado.** La aplica el propietario ([SETUP-SUPABASE](SETUP-SUPABASE.md)).

## Limitaciones conocidas

- La fecha máxima de observación es la fecha UTC del servidor (igual que `current_date` en BD):
  entre las 00:00 y las 02:00 de Madrid no se puede registrar «hoy».
- La exportación de proyecto (`/exportar`) no incluye todavía competidores ni observaciones (evita
  conflicto con #113); el registro de auditoría sí.
- La vista lista hasta 200 competidores y 1000 observaciones por proyecto, sin paginación.
- No hay importación masiva ni fuentes automáticas (Fase A).
