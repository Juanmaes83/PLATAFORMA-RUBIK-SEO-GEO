import "server-only";

// Maps a (mock) user to what the Core's platform contracts allow. All permission logic is
// the Core's `authorize`/`MATRIX`; this module only builds the actor for one membership
// (each membership is evaluated with its own role) and shapes the result for the UI.
import { platform } from "@/lib/core";
import type { Decision } from "@/lib/core";
import { DEMO_PROJECTS, type DemoProject, type DemoUser } from "@/lib/fixtures/demo";

export interface ProjectAccess {
  project: DemoProject;
  role: string;
  permissions: { action: string; decision: Decision }[];
}

function actorFor(user: DemoUser, tenantId: string, projectId: string) {
  const membership = user.memberships.find((m) => m.tenantId === tenantId && m.projectId === projectId);
  if (!membership) return null;
  return { role: membership.role, id: user.id, memberships: [{ tenantId, projectId }] };
}

export function projectAccess(user: DemoUser, tenantId: string, projectId: string): ProjectAccess | null {
  const project = DEMO_PROJECTS.find((p) => p.tenantId === tenantId && p.projectId === projectId);
  const actor = actorFor(user, tenantId, projectId);
  if (!project || !actor) return null;
  const scope = { tenantId, projectId };
  if (!platform.authorize({ actor, action: "read", scope }).allowed) return null;
  return {
    project,
    role: actor.role,
    permissions: platform.ACTIONS.map((action) => ({
      action,
      // execute-approved-action always needs a stored human approval; none exists in 9.0.
      decision: platform.authorize({ actor, action, scope, approval: null }),
    })),
  };
}

export function accessibleProjects(user: DemoUser): ProjectAccess[] {
  return user.memberships
    .map((m) => projectAccess(user, m.tenantId, m.projectId))
    .filter((a): a is ProjectAccess => a !== null);
}
