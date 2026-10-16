import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { consentedMembership } from "../fixtures/consented-membership";
import { loadKeyring } from "@/lib/provenance/keyring";
import { readAuditTrail } from "@/lib/provenance/repository";
import { writerPool } from "@/lib/provenance/writer";
import { signCompetitorReceipts } from "@/lib/competitors/audit";
import { compareMetric } from "@/lib/competitors/compare";
import type { ObservationInput } from "@/lib/competitors/contract";
import {
  addCompetitor, addObservation, eraseCompetitor, eraseObservation, findCompetitorByDomain, getCompetitor, listCompetitors,
  listObservations, loadCompetitorProject, setCompetitorStatus, updateCompetitor, verifyObservation, type CompetitorProject,
} from "@/lib/competitors/repository";
import { RUN, createConfirmedUser, deleteOrganizations, deleteUsers, signedIn } from "./support";

// N2-11 end to end against the LOCAL Supabase stack as signed-in fictitious users. RLS and the
// database triggers decide every step; the trusted writer signs the receipts the database
// queued in the same transaction.
type Client = SupabaseClient<Database>;
const orgA = `cmp-a-${RUN}`, orgB = `cmp-b-${RUN}`;
const users: string[] = [];
let owner: Client, analyst: Client, viewer: Client, approver: Client, ownerB: Client;
let a1: CompetitorProject, a2: CompetitorProject, b1: CompetitorProject;
const loaded = loadKeyring({ PROVENANCE_SIGNING_KEYS: `k-cmp:${randomBytes(32).toString("base64")}`, PROVENANCE_ACTIVE_KEY_ID: "k-cmp" });
if (!loaded.ok) throw new Error(loaded.error);
const keyring = loaded.keyring;
const today = new Date().toISOString().slice(0, 10);
const reading = (o: Partial<ObservationInput>): ObservationInput => ({
  competitorId: null, metric: "referring-domains", availability: "available", value: 100, method: "observed", sourceName: "Ahrefs",
  sourceReference: null, observedOn: today, marketCountry: "ES", marketLanguage: "es", device: null, notes: null, ...o,
});
const pending = async (projectId: string) =>
  Number((await writerPool()!.query("select count(*) from private.audit_outbox where project_id = $1 and state = 'pending'", [projectId])).rows[0].count);

beforeAll(async () => {
  users.push(...await Promise.all(["co", "can", "cvw", "cap", "cob"].map((n) => createConfirmedUser(n))));
  [owner, analyst, viewer, approver, ownerB] = await Promise.all(["co", "can", "cvw", "cap", "cob"].map(signedIn));
  expect((await owner.from("organizations").insert({ slug: orgA, name: "Agencia A" })).error).toBeNull();
  expect((await ownerB.from("organizations").insert({ slug: orgB, name: "Agencia B" })).error).toBeNull();
  const oa = (await owner.from("organizations").select("id").eq("slug", orgA).single()).data!.id;
  const ob = (await ownerB.from("organizations").select("id").eq("slug", orgB).single()).data!.id;
  expect((await owner.from("projects").insert([
    { organization_id: oa, slug: "tienda-a1", name: "A1", domain: "propio-a1.es" },
    { organization_id: oa, slug: "tienda-a2", name: "A2" },
  ])).error).toBeNull();
  expect((await ownerB.from("projects").insert({ organization_id: ob, slug: "tienda-b1", name: "B1" })).error).toBeNull();
  a1 = (await loadCompetitorProject(owner, { tenantId: orgA, projectId: "tienda-a1" }))!;
  a2 = (await loadCompetitorProject(owner, { tenantId: orgA, projectId: "tienda-a2" }))!;
  b1 = (await loadCompetitorProject(ownerB, { tenantId: orgB, projectId: "tienda-b1" }))!;
  for (const [client, role] of [[analyst, "analyst"], [viewer, "viewer"], [approver, "client-approver"]] as const) {
    await consentedMembership(owner, client, a1.projectId, role);
  }
}, 90_000);

afterAll(async () => {
  await deleteOrganizations([orgA, orgB]);
  await deleteUsers(users);
});

describe("N2-11 competitors through the Data API", () => {
  let rival = "";
  let reading1 = "";

  it("resolves the project only for its members, with its own domain", async () => {
    expect(a1).toMatchObject({ domain: "propio-a1.es" });
    expect(await loadCompetitorProject(ownerB, { tenantId: orgA, projectId: "tienda-a1" })).toBeNull();
    expect(await loadCompetitorProject(analyst, { tenantId: orgA, projectId: "tienda-a2" })).toBeNull();
  });

  it("an analyst adds a competitor; the add is idempotent by domain and audited", async () => {
    const added = await addCompetitor(analyst, a1, "rival-uno.es", { name: "Rival Uno", notes: null, relation: "direct" });
    if (!added.ok) throw new Error(added.error);
    rival = added.value;
    expect(await addCompetitor(analyst, a1, "rival-uno.es", { name: null, notes: null, relation: "direct" })).toEqual({ ok: false, error: "DUPLICATE" });
    expect(await findCompetitorByDomain(analyst, a1, "rival-uno.es")).toBe(rival);
    expect(await signCompetitorReceipts(a1.projectId, users[1], keyring)).toEqual({ ok: true, signed: 1, pending: 0 });
    const trail = await readAuditTrail(owner, a1, keyring);
    expect(trail.ok && trail.verification.valid).toBe(true);
    expect(trail.ok && trail.rows.at(-1)).toMatchObject({ action: "competitor.add", actor_role: "analyst", target: "rival-uno.es", outcome: "allowed" });
  });

  it("a viewer reads but cannot add, edit or record", async () => {
    expect((await listCompetitors(viewer, a1)).map((c) => c.domain)).toEqual(["rival-uno.es"]);
    expect(await addCompetitor(viewer, a1, "visor.es", { name: null, notes: null, relation: "direct" })).toEqual({ ok: false, error: "NOT_ALLOWED" });
    expect(await updateCompetitor(viewer, a1, rival, { name: "x", notes: null, relation: "direct" })).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await addObservation(viewer, a1, reading({ competitorId: rival }))).toEqual({ ok: false, error: "NOT_ALLOWED" });
  });

  it("organization B cannot list, read, change, observe or erase anything of A", async () => {
    expect(await listCompetitors(ownerB, a1)).toEqual([]);
    expect(await getCompetitor(ownerB, a1, rival)).toBeNull();
    expect(await listObservations(ownerB, a1)).toEqual([]);
    expect(await updateCompetitor(ownerB, a1, rival, { name: "hackeado", notes: null, relation: "direct" })).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await setCompetitorStatus(ownerB, a1, rival, "archived")).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await eraseCompetitor(ownerB, a1, rival)).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await addCompetitor(ownerB, a1, "intruso.es", { name: null, notes: null, relation: "direct" })).toEqual({ ok: false, error: "NOT_ALLOWED" });
    expect(await addObservation(ownerB, a1, reading({ competitorId: rival }))).toEqual({ ok: false, error: "NOT_ALLOWED" });
    // B's own project with A's competitor id: the composite key refuses the pairing.
    expect((await addObservation(ownerB, b1, reading({ competitorId: rival }))).ok).toBe(false);
    // A forged organization id on A's project is refused by the composite foreign key.
    expect((await addCompetitor(analyst, { ...a1, organizationId: b1.organizationId }, "forjado.es", { name: null, notes: null, relation: "direct" })).ok).toBe(false);
    expect((await getCompetitor(owner, a1, rival))?.name).toBe("Rival Uno");
  });

  it("an id from another project of the same organization matches nothing", async () => {
    expect(await getCompetitor(owner, a2, rival)).toBeNull();
    expect(await updateCompetitor(owner, a2, rival, { name: "otro", notes: null, relation: "direct" })).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await eraseCompetitor(owner, a2, rival)).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await addObservation(owner, a2, reading({ competitorId: rival }))).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await listObservations(owner, a2, rival)).toEqual([]);
  });

  it("records sourced readings; 'not available' is stored without a value; comparison is honest", async () => {
    const c = await addObservation(analyst, a1, reading({ competitorId: rival, value: 150 }));
    const p = await addObservation(analyst, a1, reading({ competitorId: null, value: 90 }));
    const na = await addObservation(analyst, a1, reading({ competitorId: rival, metric: "backlinks", availability: "not-available", value: null, sourceName: "Semrush" }));
    if (!c.ok || !p.ok || !na.ok) throw new Error("observation refused");
    reading1 = c.value;
    expect(await addObservation(analyst, a1, reading({ competitorId: rival, value: 151, sourceName: "AHREFS" }))).toEqual({ ok: false, error: "DUPLICATE" });
    expect(await addObservation(analyst, a1, reading({ competitorId: rival, metric: "authority-score", value: 140 }))).toEqual({ ok: false, error: "INVALID" });
    const all = await listObservations(viewer, a1);
    expect(all.find((o) => o.metric === "backlinks")).toMatchObject({ availability: "not-available", value: null, verification: "unverified" });
    const theirs = all.filter((o) => o.competitorId === rival && o.metric === "referring-domains");
    const mine = all.filter((o) => o.competitorId === null && o.metric === "referring-domains");
    expect(compareMetric(theirs, mine)).toMatchObject({ kind: "comparable", difference: 60, verified: false });
    expect(compareMetric(all.filter((o) => o.metric === "backlinks"), [])).toEqual({ kind: "missing-project" });
    expect(await signCompetitorReceipts(a1.projectId, users[1], keyring)).toEqual({ ok: true, signed: 3, pending: 0 });
  });

  it("only fact approvers verify, once", async () => {
    expect(await verifyObservation(analyst, a1, reading1)).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await verifyObservation(approver, a1, reading1)).toEqual({ ok: true, value: undefined });
    expect(await verifyObservation(approver, a1, reading1)).toEqual({ ok: false, error: "NOT_FOUND" });
    expect((await listObservations(viewer, a1, rival)).find((o) => o.id === reading1)?.verification).toBe("verified");
    expect(await signCompetitorReceipts(a1.projectId, users[3], keyring)).toEqual({ ok: true, signed: 1, pending: 0 });
  });

  it("archive is a review decision and keeps the history; archived competitors take no readings", async () => {
    expect(await setCompetitorStatus(analyst, a1, rival, "archived")).toEqual({ ok: false, error: "NOT_ALLOWED" });
    expect(await updateCompetitor(analyst, a1, rival, { name: "Rival Uno SL", notes: "Tienda online", relation: "indirect" })).toEqual({ ok: true, value: undefined });
    expect(await setCompetitorStatus(owner, a1, rival, "archived")).toEqual({ ok: true, value: undefined });
    expect(await getCompetitor(viewer, a1, rival)).toMatchObject({ status: "archived", name: "Rival Uno SL", relation: "indirect" });
    expect(await addObservation(analyst, a1, reading({ competitorId: rival, metric: "organic-keywords" }))).toEqual({ ok: false, error: "ARCHIVED" });
    expect(await listObservations(viewer, a1, rival)).toHaveLength(2);
    expect(await setCompetitorStatus(owner, a1, rival, "active")).toEqual({ ok: true, value: undefined });
  });

  it("only the owner erases; every change is signed into one valid chain", async () => {
    const own = (await listObservations(owner, a1, null))[0];
    expect(await eraseObservation(analyst, a1, own.id)).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await eraseCompetitor(analyst, a1, rival)).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await eraseObservation(owner, a1, own.id)).toEqual({ ok: true, value: undefined });
    expect(await eraseCompetitor(owner, a1, rival)).toEqual({ ok: true, value: undefined });
    expect(await listObservations(owner, a1)).toEqual([]);
    await signCompetitorReceipts(a1.projectId, users[1], keyring);
    expect(await signCompetitorReceipts(a1.projectId, users[0], keyring)).toEqual({ ok: true, signed: 4, pending: 0 });
    expect(await pending(a1.projectId)).toBe(0);
    const trail = await readAuditTrail(owner, a1, keyring);
    if (!trail.ok) throw new Error(trail.error);
    expect(trail.verification.valid).toBe(true);
    expect(trail.rows.map((r) => r.action)).toEqual([
      "competitor.add", "competitor.observation.add", "competitor.observation.add", "competitor.observation.add",
      "competitor.observation.verify", "competitor.update", "competitor.archive", "competitor.restore",
      "competitor.observation.erase", "competitor.erase",
    ]);
    expect(trail.rows.find((r) => r.action === "competitor.observation.verify")?.actor_role).toBe("client-approver");
  });

  it("an operator deletion of an organization cascades through competitors without a JWT and without orphan receipts", async () => {
    const added = await addCompetitor(owner, a2, "rival-dos.es", { name: null, notes: null, relation: "direct" });
    if (!added.ok) throw new Error(added.error);
    expect((await addObservation(owner, a2, reading({ competitorId: added.value }))).ok).toBe(true);
    expect(await signCompetitorReceipts(a2.projectId, users[0], keyring)).toEqual({ ok: true, signed: 2, pending: 0 });
    expect(await pending(a1.projectId) + await pending(a2.projectId)).toBe(0);
    // Projects cannot be deleted through the Data API; the operator path (service role, no
    // auth.uid()) must still cascade: the competitor triggers skip receipts for cascades.
    await deleteOrganizations([orgA]);
    const left = await writerPool()!.query("select count(*) from private.audit_outbox where project_id = any($1::uuid[])", [[a1.projectId, a2.projectId]]);
    expect(Number(left.rows[0].count)).toBe(0);
  });
});
