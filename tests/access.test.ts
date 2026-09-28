import { describe, expect, it } from "vitest";
import { accessibleProjects, projectAccess } from "@/lib/access";
import { platform } from "@/lib/core";
import { DEMO_USERS, findDemoUser } from "@/lib/fixtures/demo";

const user = (id: string) => {
  const u = findDemoUser(id);
  if (!u) throw new Error(id);
  return u;
};
const allowed = (id: string, tenantId: string, projectId: string) =>
  projectAccess(user(id), tenantId, projectId)?.permissions.filter((p) => p.decision.allowed).map((p) => p.action);

describe("project access through the Core platform contracts", () => {
  it("lists only projects the user is a member of", () => {
    expect(accessibleProjects(user("demo-owner")).map((a) => a.project.projectId)).toEqual(["restaurante-demo", "inmobiliaria-demo"]);
    expect(accessibleProjects(user("demo-viewer")).map((a) => a.project.projectId)).toEqual(["despacho-demo"]);
  });

  it("denies another tenant's project and unknown projects alike", () => {
    expect(projectAccess(user("demo-owner"), "otra-agencia", "despacho-demo")).toBeNull();
    expect(projectAccess(user("demo-viewer"), "agencia-demo", "restaurante-demo")).toBeNull();
    expect(projectAccess(user("demo-owner"), "agencia-demo", "no-existe")).toBeNull();
    expect(projectAccess(user("demo-analyst"), "agencia-demo", "inmobiliaria-demo")).toBeNull();
  });

  it("uses the role of the membership for that project (Core MATRIX)", () => {
    expect(allowed("demo-viewer", "otra-agencia", "despacho-demo")).toEqual(["read"]);
    expect(allowed("demo-analyst", "agencia-demo", "restaurante-demo")).toEqual(["read", "draft", "propose-action"]);
    expect(allowed("demo-owner", "agencia-demo", "restaurante-demo")).toEqual([...platform.MATRIX.owner]);
  });

  it("returns the Core's own decisions, including denial reasons", () => {
    const access = projectAccess(user("demo-analyst"), "agencia-demo", "restaurante-demo");
    const approve = access?.permissions.find((p) => p.action === "approve-external-action");
    expect(approve?.decision).toEqual(
      platform.authorize({
        actor: { role: "analyst", id: "demo-analyst", memberships: [{ tenantId: "agencia-demo", projectId: "restaurante-demo" }] },
        action: "approve-external-action",
        scope: { tenantId: "agencia-demo", projectId: "restaurante-demo" },
      }),
    );
    expect(approve?.decision).toMatchObject({ allowed: false, reason: "ROLE_NOT_ALLOWED" });
  });

  it("never allows executing an external action in CORE-9.0 (no stored human approval)", () => {
    for (const u of DEMO_USERS) {
      for (const a of accessibleProjects(u)) {
        const execute = a.permissions.find((p) => p.action === "execute-approved-action");
        expect(execute?.decision.allowed, `${u.id} ${a.project.projectId}`).toBe(false);
      }
    }
  });

  it("uses only fictitious data (reserved .test domains)", async () => {
    const { DEMO_PROJECTS } = await import("@/lib/fixtures/demo");
    expect(DEMO_PROJECTS.every((p) => p.domain.endsWith(".test"))).toBe(true);
  });
});
