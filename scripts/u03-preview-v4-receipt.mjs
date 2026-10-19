import { register } from 'node:module';
import { Pool } from 'pg';

register('./lib/app-ts-hooks.mjs', import.meta.url);

export const PREVIEW_REF = 'rhnnplewqsekrnaousyl';
export const RECEIPT_ROLE = 'rubik_preview_receipt_writer';
export const V4_SECURITY_DEFINER_ALLOWLIST = Object.freeze([
  'private.audit_writer_project(uuid)',
  'public.preview_environment_identity()',
]);
export const EFFECTIVE_FUNCTION_AUDIT_SQL = `with executable as (
  select format('%I.%I(%s)', n.nspname, p.proname, oidvectortypes(p.proargtypes)) as signature,
    p.prosecdef
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.prokind in ('f', 'p')
    and has_schema_privilege($1, n.oid, 'USAGE')
    and has_function_privilege($1, p.oid, 'EXECUTE')
)
select coalesce(array_agg(signature order by signature), array[]::text[]) as executable_functions,
  coalesce(array_agg(signature order by signature) filter (where prosecdef), array[]::text[])
    as executable_security_definer_functions
from executable`;
export function isV4SecurityDefinerAllowlistOnly(functions) {
  if (!Array.isArray(functions)) return false;
  const actual = [...functions].sort();
  const expected = [...V4_SECURITY_DEFINER_ALLOWLIST].sort();
  return actual.length === expected.length && actual.every((name, index) => name === expected[index]);
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateReceiptConfig(env) {
  if (env.U03_PREVIEW_REF !== PREVIEW_REF) throw new Error('V4_REF_REJECTED');
  const raw = env.U03_PREVIEW_RECEIPT_DATABASE_URL;
  if (!raw) throw new Error('V4_CREDENTIAL_MISSING');
  let url;
  try { url = new URL(raw); } catch { throw new Error('V4_DATABASE_URL_INVALID'); }
  if (url.protocol !== 'postgresql:' || !url.password || url.hash ||
      [...url.searchParams.keys()].some(key => key.toLowerCase().startsWith('ssl'))) throw new Error('V4_DATABASE_URL_INVALID');
  const direct = url.hostname === `db.${PREVIEW_REF}.supabase.co` && decodeURIComponent(url.username) === RECEIPT_ROLE;
  const pooler = url.hostname.endsWith('.pooler.supabase.com') &&
    decodeURIComponent(url.username) === `${RECEIPT_ROLE}.${PREVIEW_REF}`;
  if (!direct && !pooler) throw new Error('V4_DATABASE_TARGET_REJECTED');
  if (!/^u03-v4-[a-z0-9-]{2,40}$/.test(env.U03_PREVIEW_RECEIPT_KEY_ID ?? '') ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(env.U03_PREVIEW_RECEIPT_SIGNING_KEY ?? '')) throw new Error('V4_SIGNING_KEY_INVALID');
  return { url: raw, keyId: env.U03_PREVIEW_RECEIPT_KEY_ID, key: env.U03_PREVIEW_RECEIPT_SIGNING_KEY };
}

export async function openPreviewReceiptProcessor({ env = process.env, PoolClass = Pool, processFn, verifyTrailFn } = {}) {
  const config = validateReceiptConfig(env);
  const [{ loadKeyring }, { SUPABASE_ROOT_2021_CA }, { processAuditOutboxWithPool }, { verifyAuditTrail }] = await Promise.all([
    import('../src/lib/provenance/keyring.ts'), import('../src/lib/provenance/supabase-root-ca.ts'),
    import('../src/lib/provenance/outbox.ts'), import('../src/lib/provenance/audit.ts'),
  ]);
  const loaded = loadKeyring({ PROVENANCE_SIGNING_KEYS: `${config.keyId}:${config.key}`, PROVENANCE_ACTIVE_KEY_ID: config.keyId });
  if (!loaded.ok) throw new Error('V4_SIGNING_KEY_INVALID');
  processFn ??= processAuditOutboxWithPool;
  verifyTrailFn ??= verifyAuditTrail;
  const pool = new PoolClass({ connectionString: config.url, max: 1, connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000, ssl: { rejectUnauthorized: true, ca: SUPABASE_ROOT_2021_CA } });
  try {
    const check = await pool.query(`select
      current_user = $1 and session_user = $1 and not r.rolsuper and not r.rolbypassrls
        and not r.rolinherit and not r.rolcreaterole and not r.rolcreatedb
        and r.rolcanlogin and r.rolvaliduntil > now() + interval '10 minutes' as role_ok,
      i.environment = 'preview' and i.project_ref = $2 as identity_ok,
      has_table_privilege(current_user, 'private.audit_outbox', 'SELECT')
        and has_column_privilege(current_user, 'private.audit_outbox', 'state', 'UPDATE')
        and has_table_privilege(current_user, 'public.audit_events', 'SELECT')
        and has_table_privilege(current_user, 'public.audit_events', 'INSERT')
        and has_function_privilege(current_user, 'private.audit_writer_project(uuid)', 'EXECUTE') as capability_ok,
      not has_table_privilege(current_user, 'public.provider_results', 'INSERT')
        and not has_table_privilege(current_user, 'private.audit_idempotency', 'INSERT')
        and not has_table_privilege(current_user, 'private.audit_outbox', 'DELETE')
        and not has_table_privilege(current_user, 'public.audit_events', 'DELETE')
        and not exists (select 1 from pg_auth_members where member = r.oid) as narrow_ok
      from pg_roles r cross join public.preview_environment_identity() i where r.rolname = current_user`, [RECEIPT_ROLE, PREVIEW_REF]);
    const functionAudit = await pool.query(EFFECTIVE_FUNCTION_AUDIT_SQL, [RECEIPT_ROLE]);
    if (check.rows.length !== 1 || !Object.values(check.rows[0]).every(Boolean) ||
        functionAudit.rows.length !== 1 ||
        !isV4SecurityDefinerAllowlistOnly(functionAudit.rows[0].executable_security_definer_functions))
      throw new Error('V4_RECEIPT_PREFLIGHT_FAILED');
  } catch {
    await pool.end().catch(() => {});
    throw new Error('V4_RECEIPT_PREFLIGHT_FAILED');
  }
  return {
    async pendingForProject(projectId) {
      if (!UUID.test(projectId)) throw new Error('V4_RECEIPT_SCOPE_INVALID');
      const found = await pool.query(`select id, action from private.audit_outbox
        where project_id = $1::uuid and state = 'pending' order by created_at, id`, [projectId]);
      if (found.rows.length > 1 || found.rows.some(row => row.action !== 'member.withdraw'))
        throw new Error('V4_RECEIPT_SCOPE_INVALID');
      return found.rows.map(row => row.id);
    },
    async process(receiptId, projectId) {
      if (!UUID.test(receiptId) || !UUID.test(projectId)) throw new Error('V4_RECEIPT_SCOPE_INVALID');
      const scope = await pool.query(`select o.id, o.project_id, o.organization_id, o.action, o.state,
          p.organization_id as actual_organization_id, p.tenant_slug, p.project_slug
        from private.audit_outbox o cross join lateral private.audit_writer_project(o.project_id) p
        where o.id = $1::uuid and o.project_id = $2::uuid`, [receiptId, projectId]);
      const receipt = scope.rows[0];
      if (scope.rows.length !== 1 || receipt.action !== 'member.withdraw' ||
          receipt.organization_id !== receipt.actual_organization_id) throw new Error('V4_RECEIPT_SCOPE_INVALID');
      const signed = await processFn(receiptId, loaded.keyring, pool);
      if (!signed.ok) throw new Error(signed.error === 'CHAIN_INVALID' ? 'V4_SIGNATURE_INVALID' : 'V4_RECEIPT_PROCESS_FAILED');
      const after = await pool.query(`select o.state, o.event_seq, e.* from private.audit_outbox o
        join public.audit_events e on e.project_id = o.project_id and e.seq = o.event_seq
        where o.id = $1::uuid and o.project_id = $2::uuid and e.details ->> 'receiptId' = o.id::text`, [receiptId, projectId]);
      const chain = await pool.query('select * from public.audit_events where project_id = $1::uuid order by seq', [projectId]);
      if (after.rows.length !== 1 || after.rows[0].state !== 'completed' || after.rows[0].event_seq !== signed.seq ||
          !verifyTrailFn(chain.rows, { projectId, organizationId: receipt.organization_id,
            scope: { tenantId: receipt.tenant_slug, projectId: receipt.project_slug } }, loaded.keyring).valid)
        throw new Error('V4_RECEIPT_VERIFICATION_FAILED');
      return { seq: signed.seq, retried: receipt.state === 'completed' };
    },
    async close() { await pool.end(); },
  };
}
