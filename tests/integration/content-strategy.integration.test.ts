import { createHmac, randomBytes } from "node:crypto";
import { execSync } from "node:child_process";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { consentedMembership } from "../fixtures/consented-membership";
import { loadKeyring } from "@/lib/provenance/keyring";
import { readAuditTrail } from "@/lib/provenance/repository";
import { writerPool } from "@/lib/provenance/writer";
import { importFile } from "@/lib/imports/repository";
import { signContentReceipts } from "@/lib/content/audit";
import type { BriefInput, OpportunityInput } from "@/lib/content/contract";
import * as repo from "@/lib/content/repository";
import { SUPABASE_CLI } from "../../scripts/supabase-test-env.mjs";
import { RUN, createConfirmedUser, deleteOrganizations, deleteUsers, env, signedIn } from "./support";

// N2-12 end to end against the LOCAL Supabase stack, as signed-in fictitious users: RLS and the
// triggers decide each step; the trusted writer signs the receipts the database queued.
type Client = SupabaseClient<Database>;
const orgA = `cs-a-${RUN}`, orgB = `cs-b-${RUN}`;
const users: string[] = [];
let owner: Client, manager: Client, analyst: Client, viewer: Client, approver: Client, ownerB: Client;
let a1: repo.ContentProject, a2: repo.ContentProject, b1: repo.ContentProject;
const loaded = loadKeyring({ PROVENANCE_SIGNING_KEYS: `k-cs:${randomBytes(32).toString("base64")}`, PROVENANCE_ACTIVE_KEY_ID: "k-cs" });
if (!loaded.ok) throw new Error(loaded.error);
const keyring = loaded.keyring;
const opportunity = (o: Partial<OpportunityInput>): OpportunityInput => ({
  topic: "Menú del día en Madrid", searchIntent: "local", marketLanguage: "es", marketCountry: "ES", pageKind: "proposed", pageUrl: null,
  opportunityType: "create", rationale: "No hay página para esta búsqueda local.", priority: "unset", priorityReason: null, clusterId: null, clusterRole: null, ...o,
});
const brief = (b: Partial<BriefInput>): BriefInput => ({
  objective: null, audience: null, marketLanguage: "es", marketCountry: "ES", searchIntent: "local", mainTopic: "Menú del día en Madrid", targetUrl: null,
  outline: [], questions: [], internalLinks: [], sourcesConsulted: null, originalData: null, risks: null, cta: null, assignee: null, ...b,
});
// Pending CONTENT receipts only: the member withdrawal below queues its own S1 receipt, which
// the people module (not this one) signs.
const pending = async (projectId: string) =>
  Number((await writerPool()!.query("select count(*) from private.audit_outbox where project_id = $1 and state = 'pending' and action like 'content.%'", [projectId])).rows[0].count);
const enc = (s: string) => new TextEncoder().encode(s);

beforeAll(async () => {
  const names = ["cso", "csm", "csa", "csv", "csp", "csb"];
  users.push(...await Promise.all(names.map((n) => createConfirmedUser(n))));
  [owner, manager, analyst, viewer, approver, ownerB] = await Promise.all(names.map(signedIn));
  expect((await owner.from("organizations").insert({ slug: orgA, name: "Agencia A" })).error).toBeNull();
  expect((await ownerB.from("organizations").insert({ slug: orgB, name: "Agencia B" })).error).toBeNull();
  const oa = (await owner.from("organizations").select("id").eq("slug", orgA).single()).data!.id;
  const ob = (await ownerB.from("organizations").select("id").eq("slug", orgB).single()).data!.id;
  expect((await owner.from("projects").insert([
    { organization_id: oa, slug: "cliente-a1", name: "A1", domain: "restaurante-a1.es" }, { organization_id: oa, slug: "cliente-a2", name: "A2" },
  ])).error).toBeNull();
  expect((await ownerB.from("projects").insert({ organization_id: ob, slug: "cliente-b1", name: "B1" })).error).toBeNull();
  a1 = (await repo.loadContentProject(owner, { tenantId: orgA, projectId: "cliente-a1" }))!;
  a2 = (await repo.loadContentProject(owner, { tenantId: orgA, projectId: "cliente-a2" }))!;
  b1 = (await repo.loadContentProject(ownerB, { tenantId: orgB, projectId: "cliente-b1" }))!;
  for (const [client, role] of [[manager, "account-manager"], [analyst, "analyst"], [viewer, "viewer"], [approver, "client-approver"]] as const) {
    await consentedMembership(owner, client, a1.projectId, role);
  }
}, 90_000);

afterAll(async () => {
  await deleteOrganizations([orgA, orgB]);
  await deleteUsers(users);
});

describe("N2-12 content strategy through the Data API", () => {
  let cluster = "", op = "", briefId = "";

  it("an analyst creates a cluster and an opportunity in it; both are audited and signed", async () => {
    const c = await repo.addCluster(analyst, a1, { name: "Carta y menús", mainTopic: "menú del día", description: null });
    if (!c.ok) throw new Error(c.error);
    cluster = c.value;
    const o = await repo.addOpportunity(analyst, a1, opportunity({ clusterId: cluster, clusterRole: "pillar", priority: "high", priorityReason: "Hipótesis del analista" }));
    if (!o.ok) throw new Error(o.error);
    op = o.value;
    expect(await repo.addOpportunity(analyst, a1, opportunity({ topic: " menú del día en MADRID " }))).toEqual({ ok: false, error: "DUPLICATE" });
    expect(await signContentReceipts(a1.projectId, users[2], keyring)).toEqual({ ok: true, signed: 2, pending: 0 });
    const trail = await readAuditTrail(owner, a1, keyring);
    expect(trail.ok && trail.verification.valid).toBe(true);
    expect(trail.ok && trail.rows.map((r) => `${r.action}/${r.actor_role}`)).toEqual(["content.cluster.add/analyst", "content.opportunity.add/analyst"]);
  });

  it("a viewer reads but cannot propose; a client approver cannot draft", async () => {
    expect((await repo.listOpportunities(viewer, a1)).map((o) => o.id)).toEqual([op]);
    expect(await repo.addOpportunity(viewer, a1, opportunity({ topic: "Visor" }))).toEqual({ ok: false, error: "NOT_ALLOWED" });
    expect(await repo.updateOpportunity(viewer, a1, op, opportunity({ topic: "x" }))).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await repo.addCluster(approver, a1, { name: "x", mainTopic: "x", description: null })).toEqual({ ok: false, error: "NOT_ALLOWED" });
  });

  it("organization B lists, reads, changes and erases nothing of A", async () => {
    expect(await repo.loadContentProject(ownerB, { tenantId: orgA, projectId: "cliente-a1" })).toBeNull();
    expect(await repo.listOpportunities(ownerB, a1)).toEqual([]);
    expect(await repo.listClusters(ownerB, a1)).toEqual([]);
    expect(await repo.getOpportunity(ownerB, a1, op)).toBeNull();
    expect(await repo.updateOpportunity(ownerB, a1, op, opportunity({ topic: "hackeada" }))).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await repo.setOpportunityStatus(ownerB, a1, op, "discarded")).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await repo.eraseOpportunity(ownerB, a1, op)).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await repo.addOpportunity(ownerB, a1, opportunity({ topic: "Intrusa" }))).toEqual({ ok: false, error: "NOT_ALLOWED" });
    expect(await repo.addEvidence(ownerB, a1, op, { kind: "analyst-proposal", title: "x", detail: "x", providerResultId: null, importId: null, sourceUrl: null, sourceDate: null }))
      .toEqual({ ok: false, error: "NOT_ALLOWED" });
    // Using A's opportunity from B's own project: the composite key refuses it.
    expect((await repo.addEvidence(ownerB, b1, op, { kind: "analyst-proposal", title: "x", detail: "x", providerResultId: null, importId: null, sourceUrl: null, sourceDate: null })).ok).toBe(false);
    expect((await repo.getOpportunity(owner, a1, op))?.topic).toBe("Menú del día en Madrid");
  });

  it("ids of another project of the same organization match nothing; a forged organization is refused", async () => {
    expect(await repo.getOpportunity(owner, a2, op)).toBeNull();
    expect(await repo.getCluster(owner, a2, cluster)).toBeNull();
    expect(await repo.addOpportunity(owner, a2, opportunity({ topic: "Cruzada", clusterId: cluster }))).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await repo.addEvidence(owner, a2, op, { kind: "analyst-proposal", title: "x", detail: "x", providerResultId: null, importId: null, sourceUrl: null, sourceDate: null }))
      .toEqual({ ok: false, error: "NOT_FOUND" });
    expect((await repo.addOpportunity(analyst, { ...a1, organizationId: b1.organizationId }, opportunity({ topic: "Org falsa" }))).ok).toBe(false);
  });

  it("evidence links a real import of the project with its own label and date; a foreign import is refused", async () => {
    const file = (scope: { tenantId: string; projectId: string }, label: string) => enc(JSON.stringify({
      format: "rubik-import-v1", scope, source: { kind: "audit", label, tool: "revisión manual" }, capturedAt: "2026-10-01T09:00:00+02:00",
      findings: [{ url: "https://restaurante-a1.es/carta", ruleId: "thin", severity: "low", title: "Contenido escaso", observation: "Pocas palabras." }],
    }));
    const imp = await importFile(analyst, a1, file(a1.scope, "Auditoría de contenido"), { role: "analyst", id: users[2] }, keyring);
    if (!imp.ok) throw new Error(imp.error);
    const own = await importFile(owner, a2, file(a2.scope, "Auditoría A2"), { role: "owner", id: users[0] }, keyring);
    if (!own.ok) throw new Error(own.error);
    expect((await repo.addEvidence(analyst, a1, op, { kind: "import-finding", importId: imp.id, providerResultId: null, title: "inventado", detail: "Regla thin", sourceUrl: null, sourceDate: null })).ok).toBe(true);
    expect(await repo.addEvidence(owner, a1, op, { kind: "import-finding", importId: own.id, providerResultId: null, title: "x", detail: null, sourceUrl: null, sourceDate: null }))
      .toEqual({ ok: false, error: "NOT_FOUND" });
    expect((await repo.addEvidence(analyst, a1, op, { kind: "manual-source", title: "Revisión manual de la SERP", detail: null, sourceUrl: "https://www.google.es/search?q=menu", sourceDate: "2026-10-10", providerResultId: null, importId: null })).ok).toBe(true);
    const ev = await repo.listEvidence(viewer, a1, op);
    expect(ev.map((e) => [e.kind, e.title, e.sourceDate])).toEqual([["import-finding", "Auditoría de contenido", "2026-10-01"], ["manual-source", "Revisión manual de la SERP", "2026-10-10"]]);
    await signContentReceipts(a1.projectId, users[2], keyring);
  });

  it("brief: draft → in-review → returned → approved → archived → restored, attributed by the database", async () => {
    const o = (await repo.getOpportunity(analyst, a1, op))!;
    const b = await repo.createBrief(analyst, a1, o);
    if (!b.ok) throw new Error(b.error);
    briefId = b.value;
    expect(await repo.createBrief(analyst, a1, o)).toEqual({ ok: false, error: "DUPLICATE" });
    expect(await repo.setBriefStatus(analyst, a1, briefId, "in-review", null)).toEqual({ ok: false, error: "INCOMPLETE" });
    expect(await repo.updateBrief(analyst, a1, briefId, brief({ objective: "Captar reservas de mediodía", audience: "Oficinistas de la zona",
      outline: [{ level: 1, text: "Menú del día en Madrid" }, { level: 2, text: "Qué incluye" }], questions: ["¿Cuánto cuesta?"],
      internalLinks: [{ url: "/carta", anchor: "Carta" }] }))).toEqual({ ok: true, value: undefined });
    expect(await repo.setBriefStatus(analyst, a1, briefId, "in-review", null)).toEqual({ ok: true, value: undefined });
    expect(await repo.updateBrief(analyst, a1, briefId, brief({ objective: "cambio" }))).toEqual({ ok: false, error: "LOCKED" });
    expect(await repo.setBriefStatus(analyst, a1, briefId, "approved", null)).toEqual({ ok: false, error: "NOT_ALLOWED" });
    expect(await repo.setBriefStatus(approver, a1, briefId, "approved", null)).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await repo.setBriefStatus(manager, a1, briefId, "draft", "Falta la pregunta de alérgenos")).toEqual({ ok: true, value: undefined });
    expect((await repo.getBriefFor(viewer, a1, op))?.reviewNote).toBe("Falta la pregunta de alérgenos");
    const draft = (await repo.getBriefFor(analyst, a1, op))!;
    expect(await repo.updateBrief(analyst, a1, briefId, brief({ ...draft, questions: [...draft.questions, "¿Hay opciones sin gluten?"] }))).toEqual({ ok: true, value: undefined });
    expect(await repo.setBriefStatus(analyst, a1, briefId, "in-review", null)).toEqual({ ok: true, value: undefined });
    expect(await repo.setBriefStatus(manager, a1, briefId, "approved", null)).toEqual({ ok: true, value: undefined });
    const approved = (await repo.getBriefFor(viewer, a1, op))!;
    expect(approved).toMatchObject({ status: "approved", version: 3, submittedBy: users[2], approvedBy: users[1] });
    expect(approved.approvedAt).not.toBeNull();
    expect(await repo.updateBrief(manager, a1, briefId, brief({ ...approved, cta: "Reserva" }))).toEqual({ ok: false, error: "LOCKED" });
    expect(await repo.setBriefStatus(manager, a1, briefId, "draft", null)).toEqual({ ok: false, error: "TRANSITION" });
    expect(await repo.setBriefStatus(manager, a1, briefId, "archived", null)).toEqual({ ok: true, value: undefined });
    expect((await repo.getBriefFor(viewer, a1, op))).toMatchObject({ status: "archived", approvedBy: users[1] });
    expect(await repo.setBriefStatus(owner, a1, briefId, "draft", null)).toEqual({ ok: true, value: undefined });
    expect((await repo.getBriefFor(viewer, a1, op))).toMatchObject({ status: "draft", approvedBy: null, approvedAt: null });
    for (const id of [users[0], users[1], users[2]]) await signContentReceipts(a1.projectId, id, keyring);
    expect(await pending(a1.projectId)).toBe(0);
    const trail = await readAuditTrail(owner, a1, keyring);
    if (!trail.ok) throw new Error(trail.error);
    expect(trail.verification.valid).toBe(true);
    expect(trail.rows.find((r) => r.action === "content.brief.approve")).toMatchObject({ actor_role: "account-manager", actor_id: users[1] });
  });

  it("an expired JWT is refused by the Data API (positive control: the same token unexpired is accepted)", async () => {
    // Local stack only: its development JWT secret, read from the same validated CLI.
    const status = execSync(`${SUPABASE_CLI} status -o env`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const secret = /^JWT_SECRET="?(.*?)"?$/m.exec(status)?.[1];
    if (!secret) throw new Error("local JWT secret not available");
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const token = (exp: number) => {
      const head = b64({ alg: "HS256", typ: "JWT" }), body = b64({ sub: users[2], role: "authenticated", aud: "authenticated", exp, iat: exp - 3600 });
      return `${head}.${body}.${createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url")}`;
    };
    const call = (t: string) => fetch(`${env.apiUrl}/rest/v1/content_opportunities?select=id&project_id=eq.${a1.projectId}`,
      { headers: { apikey: env.publishableKey, Authorization: `Bearer ${t}` } });
    const now = Math.floor(Date.now() / 1000);
    const valid = await call(token(now + 600));
    expect(valid.status).toBe(200);
    expect(((await valid.json()) as unknown[]).length).toBe(1);
    const expired = await call(token(now - 60));
    expect(expired.status).toBe(401);
    expect(((await expired.json()) as { code: string }).code).toBe("PGRST303");
  });

  it("a member whose access is withdrawn reads nothing at once (authorization is re-evaluated per request)", async () => {
    const removed = await owner.rpc("project_people", { p_project_id: a1.projectId, p_command: "remove", p_payload: { userId: users[3] } as never });
    expect(removed.error).toBeNull();
    expect(await repo.listOpportunities(viewer, a1)).toEqual([]);
    expect(await repo.getBriefFor(viewer, a1, op)).toBeNull();
  });

  it("only the owner erases; a cluster erase keeps its opportunities; everything is signed", async () => {
    expect(await repo.eraseOpportunity(analyst, a1, op)).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await repo.eraseCluster(manager, a1, cluster)).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await repo.eraseCluster(owner, a1, cluster)).toEqual({ ok: true, value: undefined });
    expect((await repo.getOpportunity(owner, a1, op))).toMatchObject({ clusterId: null, clusterRole: null });
    expect(await repo.eraseOpportunity(owner, a1, op)).toEqual({ ok: true, value: undefined });
    expect(await repo.listEvidence(owner, a1)).toEqual([]);
    expect(await repo.listBriefs(owner, a1)).toEqual([]);
    expect(await signContentReceipts(a1.projectId, users[0], keyring)).toEqual({ ok: true, signed: 2, pending: 0 });
    expect(await pending(a1.projectId)).toBe(0);
    const trail = await readAuditTrail(owner, a1, keyring);
    expect(trail.ok && trail.verification.valid).toBe(true);
    expect(trail.ok && trail.rows.slice(-2).map((r) => r.action)).toEqual(["content.cluster.erase", "content.opportunity.erase"]);
  });
});
