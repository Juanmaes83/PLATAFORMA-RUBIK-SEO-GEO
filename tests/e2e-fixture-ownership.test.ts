import { describe, expect, it } from "vitest";
import { assertFixtureEndpoint, fixtureScope } from "../e2e/fixture-scope";
import { planCleanup, type Ledger, type Snapshot } from "../e2e/fixtures";

const run = "a".repeat(32);
function fixture() {
  const ledger: Ledger = { run, users: [{ id: "u1", email: "owned@ejemplo.test" }],
    organizations: [{ id: "o1", slug: "owned", created_by: "u1" }],
    projects: [{ id: "p1", slug: "site", organization_id: "o1" }], pendingEmails: [] };
  const snapshot: Snapshot = { users: [{ ...ledger.users[0], run }, { id: "foreign", email: "other@ejemplo.test" }],
    organizations: [...ledger.organizations, { id: "outside", slug: "agencia-ejemplo", created_by: "foreign" }],
    projects: [...ledger.projects, { id: "old-project", slug: "site", organization_id: "outside" }],
    organizationMembers: [{ organization_id: "o1", user_id: "u1" }, { organization_id: "outside", user_id: "foreign" }],
    projectMembers: [{ organization_id: "o1", project_id: "p1", user_id: "u1" }] };
  return { ledger, snapshot };
}

describe("E2E ownership preflight (no database or deletion)", () => {
  it("rejects a hosted or different local endpoint without opening a connection", () => {
    expect(() => assertFixtureEndpoint("http://127.0.0.1:54321", false)).not.toThrow();
    for (const url of ["https://foreign.supabase.co", "http://127.0.0.1:54322", "http://localhost:54321", "https://127.0.0.1:54321"]) {
      expect(() => assertFixtureEndpoint(url, false)).toThrow("require 127.0.0.1:54321");
    }
  });
  it("requires explicit isolated selection and never mixes the shared and isolated endpoints", () => {
    expect(() => assertFixtureEndpoint("http://127.0.0.1:55321", true)).not.toThrow();
    expect(() => assertFixtureEndpoint("http://127.0.0.1:55321", false)).toThrow();
    for (const url of ["http://127.0.0.1:54321", "https://foreign.supabase.co", "http://localhost:55321", "http://127.0.0.1:55322"]) {
      expect(() => assertFixtureEndpoint(url, true)).toThrow("require 127.0.0.1:55321");
    }
  });
  it("preserves foreign suffix users, legacy slugs and preexisting projects", () => {
    const { ledger, snapshot } = fixture();
    const before = structuredClone(snapshot);
    expect(planCleanup(ledger, snapshot)).toEqual({ users: ledger.users, organizations: ledger.organizations });
    expect(snapshot).toEqual(before);
  });
  it("does not adopt a preexisting identity with the expected email", () => {
    const { ledger, snapshot } = fixture();
    snapshot.users[0].run = "b".repeat(32);
    expect(() => planCleanup(ledger, snapshot)).toThrow("Ambiguous");
  });
  it("refuses a changed identity even if it retains the run marker", () => {
    const { ledger, snapshot } = fixture();
    snapshot.users[0].email = "someone-else@ejemplo.test";
    expect(() => planCleanup(ledger, snapshot)).toThrow("Ambiguous");
  });
  it("never cascades an unregistered project", () => {
    const { ledger, snapshot } = fixture();
    snapshot.projects.push({ id: "unregistered", slug: "foreign-child", organization_id: "o1" });
    expect(() => planCleanup(ledger, snapshot)).toThrow("Ambiguous");
  });
  it("refuses a foreign member inside an owned organization", () => {
    const { ledger, snapshot } = fixture();
    snapshot.organizationMembers.push({ organization_id: "o1", user_id: "foreign" });
    expect(() => planCleanup(ledger, snapshot)).toThrow("Ambiguous");
  });
  it("refuses deleting an owned account attached to a foreign organization", () => {
    const { ledger, snapshot } = fixture();
    snapshot.organizationMembers.push({ organization_id: "outside", user_id: "u1" });
    expect(() => planCleanup(ledger, snapshot)).toThrow("Ambiguous");
  });
  it("refuses changed project scope or organization creator", () => {
    const { ledger, snapshot } = fixture();
    snapshot.projects[0].organization_id = "outside";
    expect(() => planCleanup(ledger, snapshot)).toThrow("Ambiguous");
    snapshot.projects[0].organization_id = "o1";
    snapshot.organizations[0].created_by = "foreign";
    expect(() => planCleanup(ledger, snapshot)).toThrow("Ambiguous");
  });
  it("keeps an unproven UI signup instead of discovering ownership by email", () => {
    const { ledger, snapshot } = fixture();
    ledger.pendingEmails.push("other@ejemplo.test");
    expect(() => planCleanup(ledger, snapshot)).toThrow("Ambiguous");
  });
  it("allows an already-clean run to be checked again without adopting leftovers", () => {
    const { ledger } = fixture();
    expect(planCleanup(ledger, { users: [], organizations: [], projects: [], organizationMembers: [], projectMembers: [] }))
      .toEqual({ users: [], organizations: [] });
  });
  it("refuses duplicate receipts and missing run identity", () => {
    const { ledger, snapshot } = fixture();
    ledger.users.push(ledger.users[0]);
    expect(() => planCleanup(ledger, snapshot)).toThrow("Ambiguous");
    expect(() => fixtureScope("")).toThrow();
  });
  it("separates concurrent invocations without changing display names or project contracts", () => {
    const a = fixtureScope(run), b = fixtureScope("b".repeat(32));
    expect(a.tenant).not.toBe(b.tenant);
    expect(a.users.owner).not.toBe(b.users.owner);
    expect(a.tenant.length).toBeLessThanOrEqual(63);
    expect(a.project).toBe("restaurante-ejemplo");
  });
});
