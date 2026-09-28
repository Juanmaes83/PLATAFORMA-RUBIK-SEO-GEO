import { describe, expect, it } from "vitest";
import { accessibleProjects, projectAccess, type ProjectMembership } from "@/lib/access";
import { platform } from "@/lib/core";
import { isSlug, normalizeDomain } from "@/lib/tenancy-rules";

// Shapes as they come from Postgres (project_members joined with projects/organizations). In
// the app these rows are returned by RLS to their own user only; here they test the mapping
// from a stored role to the Core's decisions.
const membership = (role: string, tenantId = "agencia-a", projectId = "proyecto-a1"): ProjectMembership => ({
  userId: "00000000-0000-4000-8000-00000000000a",
  role,
  project: { tenantId, tenantName: "Agencia A", projectId, name: "Proyecto A1", domain: "a1.ejemplo.test", vertical: null },
});
const allowed = (role: string) => projectAccess(membership(role))?.permissions.filter((p) => p.decision.allowed).map((p) => p.action);
const HUMAN_ROLES = ["owner", "account-manager", "analyst", "client-approver", "viewer"];

describe("project access from a stored membership, decided by the Core", () => {
  it("no membership row means no access", () => {
    expect(projectAccess(null)).toBeNull();
    expect(accessibleProjects([])).toEqual([]);
  });

  it("each human role gets exactly its Core MATRIX permissions", () => {
    for (const role of HUMAN_ROLES) {
      const expected = platform.MATRIX[role as keyof typeof platform.MATRIX].filter((a) => a !== "execute-approved-action");
      expect([...(allowed(role) ?? [])].sort(), role).toEqual([...expected].sort());
    }
    expect(allowed("viewer")).toEqual(["read"]);
    expect(allowed("analyst")).toEqual(["read", "draft", "propose-action"]);
  });

  it("returns the Core's own decisions, including denial reasons", () => {
    const access = projectAccess(membership("analyst"));
    const approve = access?.permissions.find((p) => p.action === "approve-external-action");
    expect(approve?.decision).toEqual(
      platform.authorize({
        actor: { role: "analyst", id: "00000000-0000-4000-8000-00000000000a", memberships: [{ tenantId: "agencia-a", projectId: "proyecto-a1" }] },
        action: "approve-external-action",
        scope: { tenantId: "agencia-a", projectId: "proyecto-a1" },
      }),
    );
    expect(approve?.decision).toMatchObject({ allowed: false, reason: "ROLE_NOT_ALLOWED" });
  });

  it("unknown or non-human roles and malformed scopes never get access", () => {
    for (const role of ["ai", "superadmin", "", "OWNER"]) expect(projectAccess(membership(role)), role).toBeNull();
    expect(projectAccess(membership("owner", "Agencia A"))).toBeNull();
    expect(projectAccess(membership("owner", "agencia-a", "../otro"))).toBeNull();
  });

  it("never allows executing an external action (no stored human approval exists)", () => {
    for (const role of HUMAN_ROLES) {
      const execute = projectAccess(membership(role))?.permissions.find((p) => p.action === "execute-approved-action");
      expect(execute?.decision.allowed, role).toBe(false);
    }
  });
});

describe("tenancy input rules (mirrors the database checks)", () => {
  it("slugs use the Core scope id format", () => {
    for (const ok of ["agencia-a", "p1", "a".repeat(63)]) expect(isSlug(ok), ok).toBe(true);
    for (const bad of ["a", "-a", "Agencia", "a_b", "a/b", "a".repeat(64), "00000000-0000-4000-8000-00000000000a "]) expect(isSlug(bad), bad).toBe(false);
  });

  it("domains are optional host names", () => {
    expect(normalizeDomain("")).toBeNull();
    expect(normalizeDomain(" Ejemplo.TEST ")).toBe("ejemplo.test");
    expect(normalizeDomain("https://ejemplo.test")).toBe(false);
    expect(normalizeDomain("sin-punto")).toBe(false);
  });
});
