import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { providers } from "@/lib/core";
import { loadKeyring, type Keyring } from "@/lib/provenance/keyring";
import { buildAuditRow, verifyAuditTrail, type AuditRow, type ProjectRef } from "@/lib/provenance/audit";
import { openProviderResult, sealProviderResult } from "@/lib/provenance/results";

// Local owner tool (scripts/verify-export.mjs): run as the owner would, in a child Node process,
// with files outside the repository. Keys are random per run; no database, provider or network.
const ring = (entries: string, active: string): Keyring => {
  const r = loadKeyring({ PROVENANCE_SIGNING_KEYS: entries, PROVENANCE_ACTIVE_KEY_ID: active });
  if (!r.ok) throw new Error(r.error);
  return r.keyring;
};
const keyA = randomBytes(32).toString("base64"), keyB = randomBytes(32).toString("base64");
const owner = ring(`k-a:${keyA}`, "k-a");
const project: ProjectRef = {
  projectId: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-8222-222222222222",
  scope: { tenantId: "rubik", projectId: "sarah-katerina" },
};
const actor = { role: "owner" as const, id: "33333333-3333-4333-8333-333333333333" };

async function exportFixture() {
  const rows: AuditRow[] = [];
  for (let i = 0; i < 2; i++) {
    const b = buildAuditRow(rows.at(-1) ?? null, { at: `2026-10-09T10:0${i}:00.000Z`, actor, action: `step-${i}` }, project, owner);
    if (!b.ok) throw new Error(b.error);
    rows.push({ ...b.row, actor_id: actor.id });
  }
  const result = await providers.runProviderRequest({
    provider: "dataforseo", operation: "backlinks", input: { target: "ejemplo.test" },
    transport: { kind: "live", request: async () => ({ rows: [{ url_from: "https://a.ejemplo.test/1", url_to: "https://ejemplo.test/" }] }) },
    clock: () => new Date("2026-10-09T10:00:00Z"), budget: { maxUnits: 1, maxRequests: 1 }, confirmCost: true,
  });
  const sealed = sealProviderResult(result, project, owner);
  if (!sealed.ok) throw new Error(sealed.error);
  const row = { id: "44444444-4444-4444-8444-444444444444", ...sealed.row };
  const v = openProviderResult(row, project, owner);
  return JSON.parse(JSON.stringify({
    format: "rubik-project-export-v2", exportedAt: "2026-10-09T12:00:00.000Z", scope: project.scope,
    audit: { rows, verification: verifyAuditTrail(rows, project, owner) },
    results: [{ row, verification: { trust: v.trust, verified: v.verified, reason: v.reason } }], imports: [],
    operations: { google: { ok: true, value: { connections: [{ id: "55555555-5555-4555-8555-555555555555" }], bindings: [], captures: [] } } },
  }));
}

const dir = mkdtempSync(join(tmpdir(), "rubik-verify-export-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const file = (name: string, content: string) => {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
};
const ownerRing = file("anillo.env", `PROVENANCE_SIGNING_KEYS=k-a:${keyA}\nPROVENANCE_ACTIVE_KEY_ID=k-a\n`);

function run(args: string[], env: Record<string, string> = {}) {
  const clean = { ...process.env, PROVENANCE_SIGNING_KEYS: "", PROVENANCE_ACTIVE_KEY_ID: "", ...env };
  try {
    const stdout = execFileSync(process.execPath,
      ["--experimental-strip-types", "--disable-warning=ExperimentalWarning", "scripts/verify-export.mjs", ...args],
      { encoding: "utf8", env: clean, stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out: stdout };
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string };
    return { code: err.status, out: `${err.stdout}${err.stderr}` };
  }
}

describe("verify:export (local tool for the owner)", () => {
  it("verifies a genuine export with the keyring file and never prints a key", async () => {
    const r = run([file("ok.json", JSON.stringify(await exportFixture())), "--keyring", ownerRing]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("Auditoría: válida, 2 evento(s)");
    expect(r.out).toContain("Resultados firmados: 1/1 verificados");
    expect(r.out).toContain("1 conexión(es)");
    expect(r.out).toContain("RESULTADO: VERIFICADA");
    expect(r.out).not.toContain(keyA);
  }, 30_000);

  it("reads the keyring from the environment when no file is given", async () => {
    const r = run([file("env.json", JSON.stringify(await exportFixture()))], { PROVENANCE_SIGNING_KEYS: `k-a:${keyA}`, PROVENANCE_ACTIVE_KEY_ID: "k-a" });
    expect(r.code).toBe(0);
  }, 30_000);

  it("reports tampering and a foreign keyring as NOT verified (exit 1)", async () => {
    const doc = await exportFixture();
    doc.results[0].row.data[0].url_from = "https://otro.test/";
    const tampered = run([file("tampered.json", JSON.stringify(doc)), "--keyring", ownerRing]);
    expect(tampered.code).toBe(1);
    expect(tampered.out).toContain("results[0]");
    expect(tampered.out).toContain("RESULTADO: NO VERIFICADA");

    const other = file("otro.env", `PROVENANCE_SIGNING_KEYS=k-b:${keyB}\nPROVENANCE_ACTIVE_KEY_ID=k-b\n`);
    const foreign = run([file("foreign.json", JSON.stringify(await exportFixture())), "--keyring", other]);
    expect(foreign.code).toBe(1);
    expect(foreign.out).toContain("Auditoría: ROTA");
    expect(foreign.out).not.toContain(keyB);
  }, 30_000);

  it("prints a machine-readable report with --json", async () => {
    const r = run([file("json.json", JSON.stringify(await exportFixture())), "--keyring", ownerRing, "--json"]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toMatchObject({ verified: true, format: "rubik-project-export-v2", keyring: { keys: 1, activeKeyId: "k-a" },
      results: { total: 1, verified: 1 }, mismatches: [], google: { present: true, connections: 1 } });
  }, 30_000);

  it("stops with exit 2 on input errors without echoing values", () => {
    expect(run([file("nada.json", JSON.stringify({ hello: 1 })), "--keyring", ownerRing])).toMatchObject({ code: 2 });
    const bad = run([file("x.json", "{}"), "--keyring", file("malo.env", "PROVENANCE_SIGNING_KEYS=k-a:corta\nPROVENANCE_ACTIVE_KEY_ID=k-a\n")]);
    expect(bad.code).toBe(2);
    expect(bad.out).toContain("KEY_TOO_SHORT");
    expect(bad.out).not.toContain("corta");
    expect(run([])).toMatchObject({ code: 2 });
  }, 30_000);

  it("refuses a file tracked by Git", () => {
    const r = run(["package.json", "--keyring", ownerRing]);
    expect(r.code).toBe(2);
    expect(r.out).toContain("versionado en Git");
  }, 30_000);
});
