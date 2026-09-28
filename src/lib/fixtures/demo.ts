// FICTITIOUS demo data for the local mock mode (DEMO_FIXTURE = true everywhere in the UI). No real people, clients, domains or
// accounts: names are generic and domains use the reserved `.test` TLD (RFC 2606).
import type { Role, Scope } from "@rubik/seo-geo-core/platform-contracts";

/** Marks everything coming from this file so the UI can label it as demo/mock (D-27). */
export const DEMO_FIXTURE = true as const;

export interface DemoProject {
  tenantId: string;
  projectId: string;
  name: string;
  domain: string;
  vertical: string;
}

export interface DemoMembership extends Scope {
  role: Role;
}

export interface DemoUser {
  id: string;
  displayName: string;
  memberships: DemoMembership[];
}

export const DEMO_PROJECTS: readonly DemoProject[] = [
  { tenantId: "agencia-demo", projectId: "restaurante-demo", name: "Restaurante de ejemplo", domain: "restaurante-demo.test", vertical: "restaurant" },
  { tenantId: "agencia-demo", projectId: "inmobiliaria-demo", name: "Inmobiliaria de ejemplo", domain: "inmobiliaria-demo.test", vertical: "real-estate" },
  { tenantId: "otra-agencia", projectId: "despacho-demo", name: "Despacho de ejemplo", domain: "despacho-demo.test", vertical: "professional-service" },
];

export const DEMO_USERS: readonly DemoUser[] = [
  {
    id: "demo-owner",
    displayName: "Titular de demostración",
    memberships: [
      { tenantId: "agencia-demo", projectId: "restaurante-demo", role: "owner" },
      { tenantId: "agencia-demo", projectId: "inmobiliaria-demo", role: "owner" },
    ],
  },
  {
    id: "demo-analyst",
    displayName: "Analista de demostración",
    memberships: [{ tenantId: "agencia-demo", projectId: "restaurante-demo", role: "analyst" }],
  },
  {
    // D-27: a client sees only their own project (reports, evidence, drafts, approvals).
    id: "demo-client",
    displayName: "Cliente de demostración",
    memberships: [{ tenantId: "agencia-demo", projectId: "inmobiliaria-demo", role: "client-approver" }],
  },
  {
    id: "demo-viewer",
    displayName: "Lectura de demostración",
    memberships: [{ tenantId: "otra-agencia", projectId: "despacho-demo", role: "viewer" }],
  },
];

export function findDemoUser(id: string | undefined | null): DemoUser | null {
  return DEMO_USERS.find((u) => u.id === id) ?? null;
}

export function findDemoProject(tenantId: string, projectId: string): DemoProject | null {
  return DEMO_PROJECTS.find((p) => p.tenantId === tenantId && p.projectId === projectId) ?? null;
}
