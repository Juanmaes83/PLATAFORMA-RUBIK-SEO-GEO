import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { consentedMembership } from "../fixtures/consented-membership";
import { loadKeyring } from "@/lib/provenance/keyring";
import { readAuditTrail } from "@/lib/provenance/repository";
import { writerPool } from "@/lib/provenance/writer";
import { signGeoReceipts } from "@/lib/geo/audit";
import type { ObservationInput } from "@/lib/geo/contract";
import * as repo from "@/lib/geo/repository";
import { opportunities } from "@/lib/geo/rules";
import { RUN, createConfirmedUser, deleteOrganizations, deleteUsers, env, signedIn } from "./support";

// N2-13 end to end against the LOCAL Supabase stack, as signed-in fictitious users. RLS and the
// triggers decide; the trusted writer signs the receipts the database queued.
type Client = SupabaseClient<Database>;
const orgA = `geo-a-${RUN}`, orgB = `geo-b-${RUN}`;
const users: string[] = [];
let owner: Client, manager: Client, analyst: Client, viewer: Client, approver: Client, ownerB: Client;
let a1: repo.GeoProject, a2: repo.GeoProject, b1: repo.GeoProject;
const loaded = loadKeyring({ PROVENANCE_SIGNING_KEYS: `k-geo:${randomBytes(32).toString("base64")}`, PROVENANCE_ACTIVE_KEY_ID: "k-geo" });
if (!loaded.ok) throw new Error(loaded.error);
const keyring = loaded.keyring;
const today = new Date().toISOString().slice(0, 10);
const reading = (o: Partial<ObservationInput>): ObservationInput => ({
  entityName: "Restaurante Sol", engine: "chatgpt", engineDetail: null, queryText: "¿Dónde comer menú del día en Madrid?", observedOn: today,
  marketLanguage: "es", marketCountry: "ES", method: "manual-copy", presence: "absent", answerExcerpt: null, citedSources: [], mentionedEntities: [],
  evidenceReference: null, notes: null, supersedesId: null, ...o,
});
const pendingGeo = async (projectId: string) =>
  Number((await writerPool()!.query("select count(*) from private.audit_outbox where project_id = $1 and state = 'pending' and action like 'geo.%'", [projectId])).rows[0].count);

beforeAll(async () => {
  const names = ["go", "gm", "ga", "gv", "gp", "gb"];
  users.push(...await Promise.all(names.map((n) => createConfirmedUser(n))));
  [owner, manager, analyst, viewer, approver, ownerB] = await Promise.all(names.map(signedIn));
  expect((await owner.from("organizations").insert({ slug: orgA, name: "Agencia A" })).error).toBeNull();
  expect((await ownerB.from("organizations").insert({ slug: orgB, name: "Agencia B" })).error).toBeNull();
  const oa = (await owner.from("organizations").select("id").eq("slug", orgA).single()).data!.id;
  const ob = (await ownerB.from("organizations").select("id").eq("slug", orgB).single()).data!.id;
  expect((await owner.from("projects").insert([{ organization_id: oa, slug: "sol-a1", name: "A1", domain: "sol.es" }, { organization_id: oa, slug: "sol-a2", name: "A2" }])).error).toBeNull();
  expect((await ownerB.from("projects").insert({ organization_id: ob, slug: "sol-b1", name: "B1" })).error).toBeNull();
  a1 = (await repo.loadGeoProject(owner, { tenantId: orgA, projectId: "sol-a1" }))!;
  a2 = (await repo.loadGeoProject(owner, { tenantId: orgA, projectId: "sol-a2" }))!;
  b1 = (await repo.loadGeoProject(ownerB, { tenantId: orgB, projectId: "sol-b1" }))!;
  for (const [client, role] of [[manager, "account-manager"], [analyst, "analyst"], [viewer, "viewer"], [approver, "client-approver"]] as const) {
    await consentedMembership(owner, client, a1.projectId, role);
  }
}, 90_000);

afterAll(async () => {
  await deleteOrganizations([orgA, orgB]);
  await deleteUsers(users);
});

describe("N2-13 GEO through the Data API", () => {
  let absent = "", mentioned = "", proposal = "";

  it("an analyst records declared observations; the same reading is idempotent; hostile text is stored as data", async () => {
    const a = await repo.addObservation(analyst, a1, reading({ answerExcerpt: "<img src=x onerror=alert(1)> Recomiendo Bar Luna." }));
    if (!a.ok) throw new Error(a.error);
    absent = a.value;
    const m = await repo.addObservation(analyst, a1, reading({ engine: "gemini", presence: "mentioned", citedSources: [{ url: "https://guia.es/top", title: "Top" }], mentionedEntities: ["Bar Luna"] }));
    if (!m.ok) throw new Error(m.error);
    mentioned = m.value;
    expect(await repo.addObservation(analyst, a1, reading({}))).toEqual({ ok: false, error: "DUPLICATE" });
    const stored = await repo.getObservation(viewer, a1, absent);
    expect(stored).toMatchObject({ verification: "declared", verifiedBy: null, answerExcerpt: "<img src=x onerror=alert(1)> Recomiendo Bar Luna." });
    expect(await signGeoReceipts(a1.projectId, users[2], keyring)).toEqual({ ok: true, signed: 2, pending: 0 });
    const trail = await readAuditTrail(owner, a1, keyring);
    expect(trail.ok && trail.verification.valid).toBe(true);
    expect(trail.ok && trail.rows.map((r) => `${r.action}/${r.actor_role}`)).toEqual(["geo.observation.add/analyst", "geo.observation.add/analyst"]);
  });

  it("a viewer reads but cannot record or verify", async () => {
    expect((await repo.listObservations(viewer, a1)).length).toBe(2);
    expect(await repo.addObservation(viewer, a1, reading({ queryText: "visor" }))).toEqual({ ok: false, error: "NOT_ALLOWED" });
    expect(await repo.verifyObservation(viewer, a1, absent)).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("organization B reads, changes and erases nothing of A; ids of another project match nothing", async () => {
    expect(await repo.loadGeoProject(ownerB, { tenantId: orgA, projectId: "sol-a1" })).toBeNull();
    expect(await repo.listObservations(ownerB, a1)).toEqual([]);
    expect(await repo.getObservation(ownerB, a1, absent)).toBeNull();
    expect(await repo.eraseObservation(ownerB, a1, absent)).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await repo.addObservation(ownerB, a1, reading({ queryText: "intrusa" }))).toEqual({ ok: false, error: "NOT_ALLOWED" });
    expect((await repo.addObservation(ownerB, b1, reading({ supersedesId: absent }))).ok).toBe(false);
    expect(await repo.getObservation(owner, a2, absent)).toBeNull();
    expect(await repo.addObservation(owner, a2, reading({ supersedesId: absent }))).toEqual({ ok: false, error: "NOT_FOUND" });
    expect((await repo.addObservation(analyst, { ...a1, organizationId: b1.organizationId }, reading({ queryText: "org falsa" }))).ok).toBe(false);
  });

  it("only fact approvers verify, once, attributed by the database; unverified stays declared", async () => {
    expect(await repo.verifyObservation(analyst, a1, absent)).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await repo.verifyObservation(approver, a1, absent)).toEqual({ ok: true, value: undefined });
    expect(await repo.verifyObservation(approver, a1, absent)).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await repo.getObservation(viewer, a1, absent)).toMatchObject({ verification: "verified", verifiedBy: users[4] });
    expect(await repo.getObservation(viewer, a1, mentioned)).toMatchObject({ verification: "declared", verifiedBy: null });
    await signGeoReceipts(a1.projectId, users[4], keyring);
  });

  it("opportunities come only from stored observations; a proposal is saved and reviewed by review-action roles", async () => {
    const opps = opportunities(await repo.listObservations(analyst, a1), a1.domain);
    expect(opps.map((o) => `${o.rule}:${o.priority}`)).toEqual(["competitor-cited:medium", "mentioned-not-cited:medium"]);
    expect(opps.every((o) => o.evidence.length > 0 && o.limitations.includes("No garantiza"))).toBe(true);
    const p = await repo.addProposal(analyst, a1, opps[0]);
    if (!p.ok) throw new Error(p.error);
    proposal = p.value;
    expect(await repo.addProposal(analyst, a1, opps[0])).toEqual({ ok: false, error: "DUPLICATE" });
    expect(await repo.setProposalStatus(analyst, a1, proposal, "accepted", null)).toEqual({ ok: false, error: "NOT_ALLOWED" });
    expect(await repo.setProposalStatus(approver, a1, proposal, "accepted", null)).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await repo.setProposalStatus(manager, a1, proposal, "accepted", "Encaja en el plan")).toEqual({ ok: true, value: undefined });
    expect(await repo.setProposalStatus(manager, a1, proposal, "proposed", null)).toEqual({ ok: false, error: "TRANSITION" });
    expect(await repo.setProposalStatus(manager, a1, proposal, "done", null)).toEqual({ ok: true, value: undefined });
    expect(await repo.getProposal(viewer, a1, proposal)).toMatchObject({ status: "done", reviewedBy: users[1], reviewNote: "Encaja en el plan", evidenceIds: opps[0].evidence.map((e) => e.id) });
    for (const id of [users[2], users[1]]) await signGeoReceipts(a1.projectId, id, keyring);
    expect(await pendingGeo(a1.projectId)).toBe(0);
  });

  it("no external request is made: every call of the flow goes to the local stack", async () => {
    const seen: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url).host);
      return original(input, init);
    }) as typeof fetch;
    try {
      const r = await repo.addObservation(analyst, a1, reading({ queryText: "¿Quién cita https://sol.es/menu?", presence: "cited",
        citedSources: [{ url: "https://sol.es/menu", title: "Menú" }, { url: "https://169.254.169.254/latest/meta-data", title: "no se visita" }] }));
      expect(r.ok).toBe(true);
      opportunities(await repo.listObservations(analyst, a1), a1.domain);
    } finally {
      globalThis.fetch = original;
    }
    expect(seen.length).toBeGreaterThan(0);
    expect([...new Set(seen)]).toEqual([new URL(env.apiUrl).host]);
    await signGeoReceipts(a1.projectId, users[2], keyring);
  });

  it("only the owner erases; the chain of receipts stays valid", async () => {
    expect(await repo.eraseObservation(analyst, a1, mentioned)).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await repo.eraseProposal(manager, a1, proposal)).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await repo.eraseObservation(owner, a1, mentioned)).toEqual({ ok: true, value: undefined });
    expect((await repo.getProposal(owner, a1, proposal))?.evidenceIds).toContain(mentioned);
    expect(await repo.eraseProposal(owner, a1, proposal)).toEqual({ ok: true, value: undefined });
    expect(await signGeoReceipts(a1.projectId, users[0], keyring)).toEqual({ ok: true, signed: 2, pending: 0 });
    const trail = await readAuditTrail(owner, a1, keyring);
    if (!trail.ok) throw new Error(trail.error);
    expect(trail.verification.valid).toBe(true);
    expect(trail.rows.find((r) => r.action === "geo.observation.verify")).toMatchObject({ actor_role: "client-approver", actor_id: users[4] });
    expect(trail.rows.slice(-2).map((r) => r.action)).toEqual(["geo.observation.erase", "geo.proposal.erase"]);
  });
});
