import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import offpage from "@rubik/seo-geo-core/offpage";
import { platform, providers } from "@/lib/core";
import { loadKeyring, sha256, type Keyring } from "@/lib/provenance/keyring";
import { buildAuditRow, verifyAuditTrail, type AuditRow, type ProjectRef } from "@/lib/provenance/audit";
import { openProviderResult, sealProviderResult } from "@/lib/provenance/results";

// CORE-9.2 (ADR 0004): keyring, audit chain and signed results without a database. Keys are
// random per run and exist only in this process.
const k = () => randomBytes(32).toString("base64");
const keysA = k(), keysB = k();
const ring = (active: string, entries = `k-a:${keysA},k-b:${keysB}`): Keyring => {
  const r = loadKeyring({ PROVENANCE_SIGNING_KEYS: entries, PROVENANCE_ACTIVE_KEY_ID: active });
  if (!r.ok) throw new Error(r.error);
  return r.keyring;
};
const project: ProjectRef = {
  projectId: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-8222-222222222222",
  scope: { tenantId: "agencia-a", projectId: "proyecto-a1" },
};
const actor = { role: "owner" as const, id: "33333333-3333-4333-8333-333333333333" };

function chain(keyring: Keyring, n = 3): AuditRow[] {
  const rows: AuditRow[] = [];
  for (let i = 0; i < n; i++) {
    const b = buildAuditRow(rows.at(-1) ?? null, { at: `2026-10-07T10:0${i}:00.000Z`, actor, action: `step-${i}`, details: { n: i, note: "ok" } }, project, keyring);
    if (!b.ok) throw new Error(b.error);
    rows.push({ ...b.row, actor_id: actor.id });
  }
  return rows;
}

async function liveResult() {
  return providers.runProviderRequest({
    provider: "dataforseo", operation: "backlinks", input: { target: "ejemplo.test" },
    transport: { kind: "live", request: async () => ({ rows: [{ url_from: "https://a.ejemplo.test/1", url_to: "https://ejemplo.test/" }] }) },
    clock: () => new Date("2026-10-07T10:00:00Z"), budget: { maxUnits: 1, maxRequests: 1 }, confirmCost: true,
  });
}

describe("keyring", () => {
  it("refuses missing, malformed, short, duplicate and inactive configurations without echoing values", () => {
    const secret = randomBytes(8).toString("base64");
    const cases: [Record<string, string | undefined>, string][] = [
      [{}, "KEYRING_NOT_CONFIGURED"],
      [{ PROVENANCE_SIGNING_KEYS: `k-a:${keysA}` }, "KEYRING_NOT_CONFIGURED"],
      [{ PROVENANCE_SIGNING_KEYS: `K A:${keysA}`, PROVENANCE_ACTIVE_KEY_ID: "k-a" }, "KEYRING_MALFORMED"],
      [{ PROVENANCE_SIGNING_KEYS: `k-a:${secret}`, PROVENANCE_ACTIVE_KEY_ID: "k-a" }, "KEY_TOO_SHORT"],
      [{ PROVENANCE_SIGNING_KEYS: `k-a:${keysA},k-a:${keysB}`, PROVENANCE_ACTIVE_KEY_ID: "k-a" }, "DUPLICATE_KEY_ID"],
      [{ PROVENANCE_SIGNING_KEYS: `k-a:${keysA}`, PROVENANCE_ACTIVE_KEY_ID: "k-z" }, "ACTIVE_KEY_MISSING"],
    ];
    for (const [env, error] of cases) {
      const r = loadKeyring(env);
      expect(r).toEqual({ ok: false, error });
      expect(JSON.stringify(r)).not.toContain(secret);
    }
  });

  it("exposes key ids, never key material", () => {
    const r = ring("k-a");
    expect(r.keyIds).toEqual(["k-a", "k-b"]);
    expect(JSON.stringify(r)).not.toContain(keysA);
    expect(() => r.signer.sign("x", { keyId: "k-b" })).toThrow(/active key/);
  });

  it("sha256 is the production digest", () => {
    expect(sha256.alg).toBe("sha256");
    expect(sha256.hash("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("audit chain", () => {
  it("builds a SHA-256 chain that the Core verifies and the platform signs", () => {
    const keyring = ring("k-a"), rows = chain(keyring);
    expect(rows.map((r) => r.seq)).toEqual([1, 2, 3]);
    expect(rows[1].prev_hash).toBe(rows[0].hash);
    expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.hash) && /^[0-9a-f]{64}$/.test(r.signature) && r.key_id === "k-a")).toBe(true);
    expect(verifyAuditTrail(rows, project, keyring)).toEqual({ valid: true, length: 3 });
  });

  it("detects tampering, reordering, forged rows, foreign rows and unknown keys", () => {
    const keyring = ring("k-a"), rows = chain(keyring);
    const v = (r: AuditRow[], kr = keyring) => verifyAuditTrail(r, project, kr);
    expect(v(rows.map((r, i) => (i === 1 ? { ...r, outcome: "denied" } : r)))).toMatchObject({ valid: false, brokenAt: 1, reason: "HASH" });
    expect(v(rows.map((r, i) => (i === 1 ? { ...r, details: { n: 99, note: "ok" } } : r)))).toMatchObject({ valid: false, reason: "HASH" });
    expect(v([rows[0], rows[2]])).toMatchObject({ valid: false, brokenAt: 1, reason: "SEQUENCE" });
    expect(v(rows.map((r, i) => (i === 2 ? { ...r, prev_hash: rows[0].hash } : r)))).toMatchObject({ valid: false, brokenAt: 2, reason: "LINK" });
    // A client that recomputes a valid SHA-256 chain without the server key is caught by the HMAC.
    const forged = chain(ring("k-a", `k-a:${k()}`));
    expect(v(forged)).toMatchObject({ valid: false, brokenAt: 0, reason: "SIGNATURE" });
    expect(v(rows.map((r) => ({ ...r, key_id: "k-retired" })))).toMatchObject({ valid: false, reason: "SIGNATURE" });
    expect(v(rows.map((r) => ({ ...r, project_id: "44444444-4444-4444-8444-444444444444" })))).toMatchObject({ valid: false, reason: "SCOPE" });
  });

  it("rotation: rows signed with a retired key still verify while the key is kept", () => {
    const old = chain(ring("k-a"), 2);
    const next = buildAuditRow(old[1], { at: "2026-10-07T11:00:00.000Z", actor, action: "after-rotation" }, project, ring("k-b"));
    if (!next.ok) throw new Error(next.error);
    const rows = [...old, { ...next.row, actor_id: actor.id }];
    expect(rows.map((r) => r.key_id)).toEqual(["k-a", "k-a", "k-b"]);
    expect(verifyAuditTrail(rows, project, ring("k-b"))).toEqual({ valid: true, length: 3 });
    expect(verifyAuditTrail(rows, project, ring("k-b", `k-b:${keysB}`))).toMatchObject({ valid: false, brokenAt: 0, reason: "SIGNATURE" });
  });

  it("the Core refuses secret-looking detail keys and events before the previous one", () => {
    const keyring = ring("k-a"), rows = chain(keyring, 1);
    expect(buildAuditRow(rows[0], { at: "2026-10-07T10:05:00.000Z", actor, action: "x", details: { token: "abc" } }, project, keyring)).toEqual({ ok: false, error: "INVALID_DETAIL_KEY" });
    expect(buildAuditRow(rows[0], { at: "2026-10-06T10:00:00.000Z", actor, action: "x" }, project, keyring)).toEqual({ ok: false, error: "EVENT_BEFORE_PREVIOUS" });
  });
});

describe("signed provider results", () => {
  it("seals a Core-issued result with sha256 and reopens it after a JSON round trip", async () => {
    const keyring = ring("k-a"), r = await liveResult();
    const sealed = sealProviderResult(r, project, keyring);
    if (!sealed.ok) throw new Error(sealed.error);
    expect(sealed.row).toMatchObject({ provider: "dataforseo", operation: "backlinks", data_hash_alg: "sha256", key_id: "k-a" });
    const stored = JSON.parse(JSON.stringify(sealed.row));
    const opened = openProviderResult(stored, project, keyring);
    expect(opened.scope).toEqual({ tenantId: project.organizationId, projectId: project.projectId });
    expect([opened.trust, opened.verified, opened.reason]).toEqual(["SIGNED_PROVENANCE", true, null]);
    // The rebuilt result is accepted by the Core's offpage only with the platform module injected.
    const m = offpage.measurement(opened.result, { providers, dimension: "backlinks", platform });
    expect([m.trust, m.verified]).toEqual(["SIGNED_PROVENANCE", true]);
    expect(offpage.measurement(JSON.parse(JSON.stringify(opened.result)), { providers, dimension: "backlinks", platform }).trust).toBe("UNTRUSTED_ENVELOPE");
  });

  it("refuses look-alike results and detects changed data, payload, key or signature", async () => {
    const keyring = ring("k-a"), r = await liveResult();
    expect(sealProviderResult(JSON.parse(JSON.stringify(r)), project, keyring)).toEqual({ ok: false, error: "NOT_AN_ISSUED_RESULT" });
    const sealed = sealProviderResult(r, project, keyring);
    if (!sealed.ok) throw new Error(sealed.error);
    const row = sealed.row;
    expect(openProviderResult({ ...row, data: [] }, project, keyring).reason).toBe("DATA_CHANGED");
    expect(openProviderResult({ ...row, signed_payload: { ...(row.signed_payload as object), status: "EMPTY", cached: true } }, project, keyring).reason).toBe("BAD_SIGNATURE");
    expect(openProviderResult({ ...row, key_id: "k-b" }, project, keyring).reason).toBe("BAD_SIGNATURE");
    expect(openProviderResult({ ...row, signature: "0".repeat(64) }, project, keyring).reason).toBe("BAD_SIGNATURE");
    expect(openProviderResult(row, project, ring("k-a", `k-a:${k()}`)).reason).toBe("BAD_SIGNATURE");
  });
});


describe("provider result project binding", () => {
  it("refuses a copied signed result even if its mutable row IDs are reassigned", async () => {
    const keyring = ring("k-a"), sealed = sealProviderResult(await liveResult(), project, keyring);
    if (!sealed.ok) throw new Error(sealed.error);
    for (const other of [{ ...project, projectId: "44444444-4444-4444-8444-444444444444" }, { ...project, organizationId: "55555555-5555-4555-8555-555555555555" }]) {
      expect(openProviderResult(sealed.row, other, keyring).reason).toBe("ROW_SCOPE_MISMATCH");
      const reassigned = { ...sealed.row, project_id: other.projectId, organization_id: other.organizationId };
      expect(openProviderResult(reassigned, other, keyring)).toMatchObject({ trust: "UNTRUSTED", verified: false, reason: "SCOPE_MISMATCH" });
    }
  });

  it("uses stable UUIDs so renaming slugs does not invalidate the signature", async () => {
    const keyring = ring("k-a"), sealed = sealProviderResult(await liveResult(), project, keyring);
    if (!sealed.ok) throw new Error(sealed.error);
    expect(openProviderResult(sealed.row, { ...project, scope: { tenantId: "renamed-org", projectId: "renamed-project" } }, keyring).verified).toBe(true);
  });

  it("refuses valid legacy signatures that do not bind the expected identity", async () => {
    const keyring = ring("k-a"), result = await liveResult();
    const sealed = sealProviderResult(result, project, keyring);
    const legacy = platform.signProvenance(result, { providers, signer: keyring.signer, keyId: keyring.activeKeyId, digest: sha256 });
    if (!sealed.ok || !legacy.ok) throw new Error("fixture refused");
    const row = { ...sealed.row, signed_payload: legacy.signed.payload, signature: legacy.signed.signature };
    expect(openProviderResult(row, project, keyring).reason).toBe("SCOPE_REQUIRED");
  });

  it("does not seal or verify with invalid database identity", async () => {
    const keyring = ring("k-a"), result = await liveResult(), bad = { ...project, projectId: "not-a-uuid" };
    expect(sealProviderResult(result, bad, keyring)).toEqual({ ok: false, error: "INVALID_SCOPE" });
    const sealed = sealProviderResult(result, project, keyring);
    if (!sealed.ok) throw new Error(sealed.error);
    expect(openProviderResult(sealed.row, bad, keyring).reason).toBe("INVALID_SCOPE");
  });
});
