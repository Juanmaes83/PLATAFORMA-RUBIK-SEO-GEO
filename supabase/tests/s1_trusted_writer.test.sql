-- S1 privilege boundary. Transactional pgTAP, isolated local stack only.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select ok(not has_table_privilege('authenticated', 'public.audit_events', 'insert'), 'JWT role has no audit table INSERT');
select ok(not has_column_privilege('authenticated', 'public.audit_events', 'hash', 'insert'), 'JWT role has no audit hash column INSERT');
select ok(not has_column_privilege('authenticated', 'public.audit_events', 'signature', 'insert'), 'JWT role has no audit signature column INSERT');
select ok(not has_table_privilege('anon', 'public.audit_events', 'insert'), 'anon has no audit INSERT');
select ok(has_table_privilege('rubik_audit_writer', 'public.audit_events', 'insert'), 'dedicated role can append audit');
select ok(not has_table_privilege('rubik_audit_writer', 'public.audit_events', 'update,delete'), 'dedicated role cannot alter audit rows');
select ok(not has_table_privilege('rubik_audit_writer', 'auth.users', 'select,insert,update,delete'), 'dedicated role has no direct Auth table access');
select ok(not has_table_privilege('authenticated', 'private.audit_outbox', 'select,insert,update,delete'), 'JWT cannot inspect or forge outbox receipts');
select ok(not has_table_privilege('authenticated', 'private.audit_idempotency', 'select,insert,update,delete'), 'JWT cannot inspect or forge idempotency receipts');
select ok(not has_function_privilege('authenticated', 'private.audit_writer_actor(uuid,uuid)', 'execute'), 'JWT cannot call privileged actor resolver');
select ok(not has_column_privilege('authenticated', 'public.imports', 'id', 'insert'), 'JWT cannot choose an import receipt id');
select ok(has_function_privilege('authenticated', 'public.delete_import_with_receipt(uuid,uuid)', 'execute'), 'signed-in user may invoke RLS-bound import erasure');
select ok(not has_function_privilege('anon', 'public.delete_import_with_receipt(uuid,uuid)', 'execute'), 'anon cannot invoke import erasure');
select ok(not has_table_privilege('rubik_audit_writer', 'public.imports', 'insert,update,delete'), 'audit writer cannot mutate imports');
select ok(has_function_privilege('rubik_audit_writer', 'private.audit_writer_actor(uuid,uuid)', 'execute'), 'dedicated writer can resolve live membership');
select ok(not rolbypassrls and not rolcreaterole and not rolcreatedb and not rolsuper and not rolinherit,
  'writer role has no administrative or RLS bypass capability') from pg_roles where rolname = 'rubik_audit_writer';

select * from finish();
rollback;
