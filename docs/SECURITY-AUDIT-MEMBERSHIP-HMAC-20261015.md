# Seguridad: corrección de auditoría y consentimiento de membresías — decisión técnica

**Estado: propuesta para revisión, no desplegada.** Rama independiente de `main@506ea91`. Se han confirmado las dos debilidades por inspección del SQL; **no hay mitigación de producto implementada ni pruebas locales repetidas en esta rama**.

## S1 — Contaminación permanente de `audit_events`

**Evidencia:** `20261007120000_core_9_2_audit_and_provenance.sql` otorga a `authenticated` INSERT por columnas en `audit_events`. La política `members append audit events as themselves` exige actor igual al usuario y rol efectivo, pero no HMAC. El trigger `private.link_audit_event` compara `seq`, `prev_hash` y orden temporal, **no** la firma. Por tanto cualquier miembro con sesión, incluso viewer, puede enviar una firma hexadecimal ficticia y ocupar de forma inmutable el siguiente número de secuencia. Se detectará la corrupción al verificar, pero los siguientes appends legítimos heredan una cadena inválida. Riesgo de denegación del historial, no prueba de falsificación criptográfica válida.

**No introducir un parche inseguro:** una RPC SECURITY DEFINER que escriba `audit_events` sin verificar HMAC no soluciona nada. Añadir solo una lista de acciones por rol tampoco acredita la firma. Revocar INSERT a todo `authenticated` sin sustituir el cliente actual inutilizaría el audit log.

**Solución propuesta:** trasladar la escritura a un servicio de servidor que firma y valida el actor/scope, con acceso SQL de escritura que el navegador no tenga (por ejemplo rol de escritura dedicado, credencial de servidor guardada como secreto *Production only*, con mínimo privilegio). Revocar INSERT directo de `authenticated` **en la misma entrega** que se migren todos los callers, incluido `member.withdraw`, eventos de denegación y pruebas. La identidad de aplicación y permisos han de comprobarse antes del insert. Debe ser atómico y registrar integridad de la cadena. Nunca introducir un service-role global de forma implícita, exponer credenciales o abrir una RPC pública que el navegador pueda invocar para firmar campos arbitrarios.

**Gates:** pruebas negativas de INSERT directo como viewer/analyst/owner; pruebas positivas de eventos reales; concurrencia; orden hash/seq; fallo de firma; revocación del escritor; restauración; pgTAP que impida el retorno de privilegios directos. **Requiere decisión de arquitectura y secretos** antes de implementar y desplegar.

## S2 — Pertenencia sin aceptación

**Evidencia:** `20260928120000_core_9_1_tenancy.sql` permite a un propietario de organización INSERT directo de `organization_members` con `user_id` arbitrario; análogamente `project_members` lo admite para usuarios de la organización. La membresía expone nombre y referencias de la organización al usuario añadido. El flujo `20261012090000_project_invitations.sql` sí contiene `private.accept_project_invitation`, SECURITY DEFINER, que inserta ambas membresías después de validar el token y correo confirmado.

**Corrección propuesta en una migración separada, previa adaptación de tests:** suprimir políticas `owners add org members` y `org owners add project members` para INSERT directo del JWT autenticado. Conservar inserción del owner inicial mediante los triggers SECURITY DEFINER y la inserción tras aceptación por `private.accept_project_invitation` (comprobar ejecución como owner DB y privilegios efectivos). Revisar también si APIs de administración interna necesitan un flujo de alta distinto; no permitir fallback que omita consentimiento.

**Impacto concreto:** la suite de integración existente usa INSERT directo de owner para preparar fixtures; primero habrá que adaptar setup a invitaciones aceptadas o fixture local administrado de forma explícita, sin convertir test en falso positivo. Es un cambio contractual con migración alojada: no desplegar antes de ensayo local completo.

**Gates:** owner no incorpora a usuario ajeno por `organization_members.insert`; owner no asigna proyectos de un tercero mediante `project_members.insert`; creación de organización sigue incluyendo owner; invitación confirmada activa membresía correcta; correo distinto, token vencido, token usado y B→A negados; revocaciones y retirada de acceso mantienen funcionamiento; `test:db`, `test:integration`, `npm run verify`, e2e. Prueba alojada requiere consentimiento específico.

## Separación de entregables y decisiones

- PR #85: pruebas matriz de autorización; **no corrige** estos dos hallazgos.
- PR #87: hardening de exportación, corrección fail-closed para restauración en su rama.
- Este documento explica el bloqueo técnico sin fingir que una nueva política RLS basta para garantizar HMAC.
- Mantener ambos casos en estado **ABIERTOS / REQUIEREN IMPLEMENTACIÓN**, no mezclar con el Grupo 3 alojado.

**Próximo paso ejecutable sin decisiones:** refactorizar tests de fixture de membresía para usar flujo de invitación y preparar una migración reversible S2 en una rama de código; para S1 hay que decidir el mecanismo de escritura de confianza antes de cambiar privilegios.
