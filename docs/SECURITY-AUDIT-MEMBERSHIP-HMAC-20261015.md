# Seguridad: corrección de auditoría y consentimiento de membresías — decisión técnica

> **Actualización S2 — 15/10/2026:** implementado y probado localmente en la rama
> `codex/s2-membership-consent-20261015`, desde `main@3eba9d0`; pendiente de revisión e integración.
> Verify 403/403, integración 84/84, pgTAP 581/581, rollback 10/10, Playwright 145 PASS/44 SKIP/0 FAIL.
> Migración alojada NO aplicada. Evidencia y límites en [S2-CONSENTIMIENTO-MEMBRESIAS](S2-CONSENTIMIENTO-MEMBRESIAS-20261015.md).
> S1 sigue abierto; [plan para decisión U01](S1-PLAN-ESCRITOR-CONFIABLE-20261015.md).
> El diseño inferior y sus estados de «no implementado» describen el corte anterior.

**Estado: propuesta para revisión, no desplegada.** Rama independiente creada desde `main@506ea91`; ahora #87 está fusionada como `ccdf104a` y la documentación de checkpoint #91 como `314a8a1`. Esta propuesta sigue siendo solo diseño. Se han confirmado las dos debilidades por inspección del SQL; **no hay mitigación de producto implementada ni pruebas locales repetidas en esta rama**.

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

## Plan de implementación S2 (inspección del código, 15/10/2026)

**Cambio mínimo propuesto (solo como diseño; NO ejecutado):** en una migración nueva, retirar las dos políticas RLS de INSERT directo (`owners add org members` y `org owners add project members`) **y revocar los permisos de INSERT por columna** concedidos a `authenticated` en ambas tablas. Revocar solo el permiso de tabla no basta si siguen activos los `GRANT INSERT(columna)`. No quitar SELECT/UPDATE/DELETE sin una auditoría separada.

**Flujos que deben permanecer válidos:** los triggers `private.add_creator_as_org_owner` y `private.add_creator_as_project_owner`, así como la aceptación `private.accept_project_invitation`, son `SECURITY DEFINER` y escriben desde contexto privilegiado tras comprobar la identidad/consentimiento donde corresponde. Confirmar en local quién es efectivamente el **owner** de esas funciones tras las migraciones y que su bypass RLS se limita a los casos previstos. No sustituir por una RPC que acepte `user_id` arbitrario.

**Pruebas que hay que adaptar antes de aprobar la migración:**
- `supabase/tests/rls_tenancy.test.sql` incluye dos asserts **positivos** de INSERT directo del owner y un negativo que hoy espera `23503`; tras revocar el privilegio esos casos deben verificar denegación `42501` (y crear miembros válidos mediante aceptación de invitación o fixtures creados como superusuario **solo en local**).
- `tests/integration/{tenancy,imports,provenance,google-capture}.integration.test.ts` usan INSERT directo de owner para preparar miembros ficticios. Migrar los setups a `project_invitations(create)` del propietario y `accept_project_invitation` desde la cuenta confirmada del destinatario; mantener los tests negativos de acceso y rol. La PR #85 añade `isolation-matrix.integration.test.ts` y también requiere comprobar su setup.
- `supabase/tests/project_invitations.test.sql` ya incluye la ruta de invitación; ampliar con owner intento de inserción directo rechazado y confirmación de que `accept_project_invitation` sigue concediendo solo el rol aceptado.
- Probar `organization_members` y `project_members` **por separado**, privilegios por columna con `has_column_privilege`, y ausencia de altas sin consentimiento tanto en Data API como SQL del rol autenticado.

**Criterio de salida S2:** `npm run verify`, `npm run test:integration`, `npm run test:db` y e2e verdes sobre **main actualizado**, más evidencia de las denegaciones; PR separada y en borrador hasta validación. El despliegue de la migración alojada necesita autorización específica, plan de rollback y copia de seguridad.

**S1 continúa bloqueado por arquitectura** aun si S2 pasa: un control de roles o una firma HMAC recibida desde el navegador no acredita que la firma sea auténtica; se requiere un escritor confiable y el retiro simultáneo del INSERT de usuarios normales.
