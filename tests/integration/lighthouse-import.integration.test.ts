import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { loadKeyring } from "@/lib/provenance/keyring";
import { exportProject, readAuditTrail } from "@/lib/provenance/repository";
import { getImport, importFile, loadProjectRef } from "@/lib/imports/repository";
import { lighthouseToImport } from "@/lib/imports/lighthouse";
import type { ProjectRef } from "@/lib/provenance/audit";
import { RUN, createConfirmedUser, deleteOrganizations, deleteUsers, signedIn } from "./support";

// Measurement → normalise → rubik-import-v1 → import → audit → read → export, against the LOCAL
// Supabase stack with a fictitious Lighthouse report and fictitious users.
const org = `lh-${RUN}`;
const users: string[] = [];
let owner: SupabaseClient<Database>;
let project: ProjectRef;
const loaded = loadKeyring({ PROVENANCE_SIGNING_KEYS: `k-lh:${randomBytes(32).toString("base64")}`, PROVENANCE_ACTIVE_KEY_ID: "k-lh" });
if (!loaded.ok) throw new Error(loaded.error);
const keyring = loaded.keyring;

beforeAll(async () => {
  users.push(await createConfirmedUser("lh"));
  owner = await signedIn("lh");
  expect((await owner.from("organizations").insert({ slug: org, name: "Agencia LH" })).error).toBeNull();
  const orgId = (await owner.from("organizations").select("id").eq("slug", org).single()).data!.id;
  expect((await owner.from("projects").insert({ organization_id: orgId, slug: "demo", name: "Demo" })).error).toBeNull();
  const ref = await loadProjectRef(owner, { tenantId: org, projectId: "demo" });
  if (!ref) throw new Error("project not visible to its owner");
  project = ref;
}, 60_000);

afterAll(async () => {
  await deleteOrganizations([org]);
  await deleteUsers(users);
});

describe("Lighthouse report through the manual import", () => {
  it("is imported, audited, read back and exported", async () => {
    const file = lighthouseToImport(
      {
        lighthouseVersion: "13.5.0",
        fetchTime: "2026-10-07T15:40:00.000Z",
        finalDisplayedUrl: "http://localhost:3100/",
        configSettings: { formFactor: "mobile" },
        categories: { seo: { auditRefs: [{ id: "is-crawlable", weight: 4 }] }, accessibility: { auditRefs: [{ id: "color-contrast", weight: 7 }] } },
        audits: { "is-crawlable": { title: "Blocked from indexing", score: 0 }, "color-contrast": { title: "Low contrast", score: 0 } },
      },
      { scope: project.scope, environment: "LOCAL", findingUrl: "https://demo.ejemplo.test/", acceptedRuleIds: ["lh.mobile.is-crawlable"], evidenceRef: "lh-demo.json" },
    );
    const out = await importFile(owner, project, new TextEncoder().encode(JSON.stringify(file)), { role: "owner", id: users[0] }, keyring);
    if (!out.ok) throw new Error(out.error);
    expect(out).toMatchObject({ status: "complete", findings: 2, errors: 0 });

    const stored = await getImport(owner, project, out.id);
    expect(stored?.findings.map((f) => [f.ruleId, f.status])).toEqual([
      ["lh.mobile.color-contrast", "open"],
      ["lh.mobile.is-crawlable", "accepted-risk"],
    ]);

    const trail = await readAuditTrail(owner, project, keyring);
    expect(trail.ok && trail.rows.at(-1)).toMatchObject({ action: "import.file", outcome: "allowed", details: { importId: out.id, status: "complete" } });
    expect(trail.ok && trail.verification.valid).toBe(true);

    const exported = await exportProject(owner, project, keyring, new Date().toISOString());
    if (!exported.ok) throw new Error(exported.error);
    expect((exported.export.imports as { id: string }[]).map((i) => i.id)).toEqual([out.id]);
  });
});
