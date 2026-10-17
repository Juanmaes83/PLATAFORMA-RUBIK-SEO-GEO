import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { loadKeyring } from "@/lib/provenance/keyring";
import { planRestore } from "@/lib/restore/plan";

const container = "supabase_db_rubik-n2-final-20261017";
const run = process.env.RUBIK_N2_V4_ROLLBACK === "1";
const psql = (sql: string) => execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"],
  { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();

function transactionBody(sql: string): string {
  const body = sql.replace(/(^|\n)\s*begin;\s*/i, "$1").replace(/(^|\n)\s*commit;\s*$/i, "$1");
  if (body === sql || /\b(?:begin|commit|rollback)\s*;/i.test(body)) throw new Error("Refused: unexpected transaction boundary");
  return body;
}

function privileges(file: string): string {
  const sql = readFileSync(file, "utf8");
  const section = /Privileges and RLS[^\n]*\n([\s\S]*?)--[^\n]*S1 audit receipts/.exec(sql)?.[1];
  if (!section || !section.includes("create policy") || !section.includes("grant insert")) throw new Error("Refused: missing canonical privilege section");
  return section;
}

describe.skipIf(!run)("N2-12/N2-13 containment rollback on a private local stack", () => {
  it("denies API access, preserves v4 rows, restores exact ACL/RLS policy shape and rolls back its fixtures", () => {
    const root = resolve(import.meta.dirname, "..", "..");
    const file = resolve(process.env.RUBIK_N2_V4_EXPORT_ARTIFACT ?? "");
    expect(file.startsWith(resolve(root, "test-results") + sep)).toBe(true);
    expect(execFileSync("docker", ["port", container, "5432/tcp"], { encoding: "utf8" }).trim().split(/\r?\n/).every((p) => p.endsWith(":52322"))).toBe(true);
    expect(psql("select count(*) from public.organizations;")).toBe("0");
    expect(psql("select count(*) from auth.users;")).toBe("0");

    const artifact = JSON.parse(readFileSync(file, "utf8")) as { document: Record<string, unknown>; signingKey: string; userIds: string[] };
    const loaded = loadKeyring({ PROVENANCE_SIGNING_KEYS: `k-v4:${artifact.signingKey}`, PROVENANCE_ACTIVE_KEY_ID: "k-v4" });
    if (!loaded.ok) throw new Error(loaded.error);
    const plan = planRestore(artifact.document, loaded.keyring, { operatorId: artifact.userIds[0] });
    if (!plan.ok) throw new Error(plan.error);
    const users = artifact.userIds.map((id, index) =>
      `('00000000-0000-0000-0000-000000000000','${id}','authenticated','authenticated','rollback-${index}@example.test','',now(),now(),now())`).join(",");
    const tables = ["content_clusters", "content_opportunities", "content_evidence", "content_briefs", "geo_observations", "geo_proposals"];
    const list = tables.map((t) => `'${t}'`).join(",");
    const fingerprint = `md5(
      coalesce((select string_agg(c.relname||':'||coalesce(c.relacl::text,'')||':'||c.relrowsecurity::text,'|' order by c.relname)
        from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in (${list})), '') || '|' ||
      coalesce((select string_agg(p.tablename||':'||p.policyname||':'||p.cmd||':'||coalesce(p.qual,'')||':'||coalesce(p.with_check,''),'|' order by p.tablename,p.policyname)
        from pg_policies p where p.schemaname='public' and p.tablename in (${list})), '') || '|' ||
      coalesce((select string_agg(c.relname||':'||t.tgname||':'||t.tgenabled::text,'|' order by c.relname,t.tgname)
        from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and c.relname in (${list})), ''))`;
    const rowCounts = tables.map((t) => `(select count(*) from public.${t})`).join("+");
    const contentRollback = transactionBody(readFileSync(resolve(root, "supabase/rollbacks/20261017100000_n2_12_content_strategy.sql"), "utf8"));
    const geoRollback = transactionBody(readFileSync(resolve(root, "supabase/rollbacks/20261017110000_n2_13_geo_observations.sql"), "utf8"));
    const contentPrivileges = privileges(resolve(root, "supabase/migrations/20261017100000_n2_12_content_strategy.sql"));
    const geoPrivileges = privileges(resolve(root, "supabase/migrations/20261017110000_n2_13_geo_observations.sql"));

    const result = psql(`begin;
      insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values ${users};
      ${transactionBody(plan.plan.sql)}
      create temp table n2_before as select ${fingerprint} as fingerprint, ${rowCounts} as rows;
      ${geoRollback}
      ${contentRollback}
      do $$ begin
        if (select count(*) from pg_policies where schemaname='public' and tablename in (${list})) <> 0 then raise exception 'rollback policies remain'; end if;
        if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in (${list}) and c.relrowsecurity) <> 6 then raise exception 'rollback RLS disabled'; end if;
        if has_table_privilege('authenticated','public.content_clusters','SELECT') or has_table_privilege('authenticated','public.geo_observations','SELECT') then raise exception 'rollback still readable'; end if;
        if (select ${rowCounts}) <> (select rows from n2_before) then raise exception 'rollback lost rows'; end if;
        if not exists (select 1 from pg_constraint where conname='audit_outbox_action_check') then raise exception 'outbox guard missing'; end if;
      end $$;
      ${contentPrivileges}
      ${geoPrivileges}
      do $$ begin
        if (${fingerprint}) <> (select fingerprint from n2_before) then raise exception 'ACL/RLS/triggers differ after reapply'; end if;
        if (select ${rowCounts}) <> (select rows from n2_before) then raise exception 'reapply lost rows'; end if;
      end $$;
      select 'ROLLBACK_REAPPLY_PASS';
      rollback;`);
    expect(result).toContain("ROLLBACK_REAPPLY_PASS");
    expect(psql("select count(*) from public.organizations;")).toBe("0");
    expect(psql("select count(*) from auth.users;")).toBe("0");
    expect(psql("select count(*) from private.audit_outbox where state='pending';")).toBe("0");
  }, 120_000);
});
