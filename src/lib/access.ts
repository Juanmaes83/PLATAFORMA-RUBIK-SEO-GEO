import "server-only";

// Maps a project membership loaded from Postgres (already filtered by RLS for the signed-in
// user) to what the Core's platform contracts allow. All permission logic is the Core's
// `authorize`/`MATRIX`; this module only builds the actor for that one membership and shapes
// the result for the UI. Nothing here comes from fixtures, cookies or URL parameters: the
// role is the `project_members.role` row and the scope is the organization/project slugs.
import { platform } from "@/lib/core";
import type { Decision } from "@/lib/core";

export interface ProjectRecord {
  /** Core scope tenantId: the organization slug. */
  tenantId: string;
  tenantName: string;
  /** Core scope projectId: the project slug. */
  projectId: string;
  name: string;
  domain: string | null;
  vertical: string | null;
}

export interface ProjectMembership {
  userId: string;
  role: string;
  project: ProjectRecord;
}

export interface ProjectAccess {
  project: ProjectRecord;
  role: string;
  permissions: { action: string; decision: Decision }[];
}

export function projectAccess(membership: ProjectMembership | null): ProjectAccess | null {
  if (!membership) return null;
  const parsed = platform.scope({ tenantId: membership.project.tenantId, projectId: membership.project.projectId });
  if (!parsed.ok) return null;
  const scope = { tenantId: parsed.scope.tenantId, projectId: parsed.scope.projectId };
  const actor = { role: membership.role, id: membership.userId, memberships: [scope] };
  if (!platform.authorize({ actor, action: "read", scope }).allowed) return null;
  return {
    project: membership.project,
    role: membership.role,
    permissions: platform.ACTIONS.map((action) => ({
      action,
      // execute-approved-action always needs a stored human approval; none exists yet.
      decision: platform.authorize({ actor, action, scope, approval: null }),
    })),
  };
}

export function accessibleProjects(memberships: readonly ProjectMembership[]): ProjectAccess[] {
  return memberships.map(projectAccess).filter((a): a is ProjectAccess => a !== null);
}
