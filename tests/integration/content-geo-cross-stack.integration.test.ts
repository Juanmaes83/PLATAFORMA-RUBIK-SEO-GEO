import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { loadKeyring } from "@/lib/provenance/keyring";
import { verifyProjectExport } from "@/lib/recovery/verify-export";
import { planRestore } from "@/lib/restore/plan";

const destination = "supabase_db_rubik-n2-v4-destination-20261017";
const run = process.env.RUBIK_N2_V4_DEST_CONTAINER === destination;
const psql = (sql: string) => execFileSync("docker", ["exec", "-i", destination, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"],
  { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();

describe.skipIf(!run)("v4 export to a separate local destination", () => {
  it("restores twice with original authors, all six table sets, a valid chain and no pending receipts", () => {
    const root = resolve(import.meta.dirname, "..", "..");
    const file = resolve(process.env.RUBIK_N2_V4_EXPORT_ARTIFACT ?? "");
    expect(file.startsWith(resolve(root, "test-results") + sep)).toBe(true);
    expect(execFileSync("docker", ["port", destination, "5432/tcp"], { encoding: "utf8" }).trim().split(/\r?\n/).every((p) => p.endsWith(":53322"))).toBe(true);
    expect(psql("select count(*) from supabase_migrations.schema_migrations;")).toBe("33");
    expect(psql("select count(*) from public.organizations;")).toBe("0");
    expect(psql("select count(*) from auth.users;")).toBe("0");

    const artifact = JSON.parse(readFileSync(file, "utf8")) as {
      document: Record<string, unknown>;
      signingKey: string;
      userIds: string[];
    };
    expect(artifact.document.format).toBe("rubik-project-export-v4");
    expect(artifact.userIds.length).toBeGreaterThanOrEqual(3);
    for (const id of artifact.userIds) expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const loaded = loadKeyring({ PROVENANCE_SIGNING_KEYS: `k-v4:${artifact.signingKey}`, PROVENANCE_ACTIVE_KEY_ID: "k-v4" });
    if (!loaded.ok) throw new Error(loaded.error);
    expect(verifyProjectExport(artifact.document, loaded.keyring)).toMatchObject({ ok: true, completeness: { status: "COMPLETE" } });

    const users = artifact.userIds.map((id, index) =>
      `('00000000-0000-0000-0000-000000000000','${id}','authenticated','authenticated','v4-${index}@example.test','',now(),now(),now())`).join(",");
    psql(`insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values ${users};`);
    const plan = planRestore(artifact.document, loaded.keyring, { operatorId: artifact.userIds[0] });
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.plan.counts.contentGeo).toEqual({ clusters: 1, opportunities: 2, evidence: 3, briefs: 1, observations: 2, proposals: 1 });

    const content = artifact.document.content as Record<string, Array<{ id: string; project_id: string }>>;
    const geo = artifact.document.geo as Record<string, Array<{ id: string; project_id: string }>>;
    const projectId = content.clusters[0].project_id;
    const tables = [
      ["content_clusters", content.clusters], ["content_opportunities", content.opportunities],
      ["content_evidence", content.evidence], ["content_briefs", content.briefs],
      ["geo_observations", geo.observations], ["geo_proposals", geo.proposals],
    ] as const;
    const snapshot = () => tables.map(([table, expected]) => {
      const rows = JSON.parse(psql(`select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb)::text from public.${table} t where project_id = '${projectId}';`));
      expect(rows).toEqual([...expected].sort((a, b) => a.id.localeCompare(b.id)));
      return rows;
    });

    psql(plan.plan.sql);
    const first = snapshot();
    psql(plan.plan.sql);
    expect(snapshot()).toEqual(first);
    const sourceAudit = (artifact.document.audit as { rows: Array<{ seq: number; hash: string; prev_hash: string; signature: string }> }).rows
      .map(({ seq, hash, prev_hash, signature }) => ({ seq, hash, prev_hash, signature }));
    const restoredAudit = JSON.parse(psql(`select coalesce(jsonb_agg(jsonb_build_object(
      'seq', seq, 'hash', hash, 'prev_hash', prev_hash, 'signature', signature) order by seq), '[]'::jsonb)::text
      from public.audit_events where project_id = '${projectId}';`));
    expect(restoredAudit).toEqual(sourceAudit);
    expect(psql(`select count(*) from private.audit_outbox where project_id = '${projectId}' and state = 'pending';`)).toBe("0");
    expect(psql("select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and t.tgenabled <> 'O' and c.relname like any (array['content_%','geo_%']);")).toBe("0");
  }, 120_000);
});
