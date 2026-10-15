# Revisión independiente S1 · recibos pendientes y eliminación de proyectos

**Base:** PR #104, HEAD `41512756ac1ce80934692d1722fd41bd95993933`. Esta rama es una contribución **hacia S1** y no altera main, PR #104, Supabase alojado, Production, FLOOR PLAN ni el trabajo de Claude N1-04.

## Riesgo constatado en el esquema

`private.audit_outbox.project_id` hace referencia a `public.projects(id) ON DELETE CASCADE` (migración `20261015145025`). Si se elimina un proyecto o su organización mientras sus recibos están en `state='pending'`, PostgreSQL puede eliminar dichos recibos antes de que el firmador construya el evento pendiente. El archivo `docs/HANDOFF-S1-20261015.md` ya registraba este riesgo. Es una pérdida de capacidad de reconciliación, aunque las filas de auditoría completadas sigan el contrato histórico de retención ligado al proyecto.

## Cambio propuesto

La migración local `20261015201500_s1_pending_receipt_delete_guard.sql` añade el trigger `projects_pending_audit_guard`, BEFORE DELETE en `public.projects`. La función `private.reject_project_delete_with_pending_audit` es SECURITY DEFINER, `search_path` vacío y sin EXECUTE para roles JWT. Si existen recibos pendientes del proyecto, aborta el DELETE con SQLSTATE `55000` tanto para baja directa como cuando se llega desde una baja de organización.

La decisión es deliberadamente **fail-closed**: un error de firma o de disponibilidad no autoriza destruir los recibos pendientes. Si ya están completados, la eliminación conserva el contrato de retención existente. No crea cuentas, claves ni jobs automáticos; no añade rutas HTTP ni muestra el contenido de auditoría.

## Pruebas nuevas

`supabase/tests/s1_pending_receipt_project_delete.test.sql` incorpora:
- Inventario de trigger activo, SECURITY DEFINER, `search_path` fijo y EXECUTE no expuesto.
- Intento administrativo directo de borrar un proyecto con recibo pendiente: aborta y conserva proyecto+recibo.
- Intento de borrar la organización con proyecto pendiente: aborta y conserva ambas entidades.
- Tras simular recibo `completed` en un fixture que se deshace al final, ambos borrados vuelven a seguir el contrato histórico.

**Estado de evidencia:** revisión estática del código y del SQL desde GitHub. No se ha podido ejecutar pgTAP ni PostgreSQL en esta sesión; **ningún test SQL se declara PASS**. Es obligatorio ejecutar el pgTAP sobre un stack **local aislado**, más una prueba de concurrencia DELETE vs creación de recibos antes de integrar.

## Política de reversión y pendientes de decisión

No se incluye una reversión que sencillamente haga `DROP TRIGGER`, porque reabriría silenciosamente la pérdida de pendientes. Si el guard bloquea una baja legítima:
1. Revisar el número, proyecto y antigüedad de los recibos por un canal **de operador** autorizado, sin exponer payloads a JWT ordinarios.
2. Procesarlos con el firmador confiable y keyring correcto, o seguir un procedimiento explícito de incidente respaldado y aprobado; no marcar recibos como completados sin evento HMAC verificable.
3. Repetir el borrado normal una vez no existan pendientes.
4. Para un rollback operativo de emergencia, preparar y aprobar por separado una contención **igual o más restrictiva**, con copia de seguridad verificable. Nunca desactivar la protección sobre pendientes por defecto.

**Límites:** no resuelve por sí sola el diseño completo de retención ante borrado por superusuario, `session_replication_role`, triggers administrativos deshabilitados o carreras sin ensayo. No resuelve tampoco la relación duradera entre llamada Google/OpenSEO y evento final, alertas, claves ni pooler alojado. Es una medida defensiva incremental para que un DELETE ordinario no destruya por cascada el único recibo pendiente.

**Gate:** antes de fusionar hacia S1, ensayar pgTAP, concurrencia, cascadas e integración; auditar el HEAD final. Aplicar al Supabase alojado exige autorización específica del propietario.
