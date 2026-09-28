// Type declarations for the parts of RUBIK-SEO-GEO-CORE this app uses. They describe the
// shape of the Core's existing JavaScript contracts; they contain no logic. The Core ships
// no .d.ts files today (see docs/adr/0001 "Propuesta al Core").

declare module "@rubik/seo-geo-core/platform-contracts" {
  export type Role =
    | "owner"
    | "account-manager"
    | "analyst"
    | "client-approver"
    | "viewer"
    | "system"
    | "ai";

  export interface Scope {
    tenantId: string;
    projectId: string;
    key?: string;
  }

  export interface Actor {
    role: Role | string;
    id?: string;
    memberships: Scope[];
  }

  export interface Approval {
    by: string;
    role: Role | string;
    at: string;
    scope: Scope;
  }

  export interface Decision {
    allowed: boolean;
    reason: string | null;
    [extra: string]: unknown;
  }

  export interface Connector {
    id: string;
    providerOps: string[];
    auth: string;
    dataClass: string;
    consent: string;
    status: "NOT_IMPLEMENTED" | "NOT_DESIGNED" | string;
    paid?: boolean;
    openQuestions?: string[];
  }

  interface PlatformContracts {
    readonly ROLES: readonly Role[];
    readonly ACTIONS: readonly string[];
    readonly MATRIX: Readonly<Record<Role, readonly string[]>>;
    readonly APPROVER_ROLES: readonly Role[];
    readonly CONNECTORS: readonly Connector[];
    scope(input: { tenantId?: string; projectId?: string }):
      | { ok: true; scope: Scope & { key: string } }
      | { ok: false; error: { code: string } };
    authorize(input: {
      actor: Actor;
      action: string;
      scope: Scope;
      approval?: Approval | null;
    }): Decision;
  }

  const api: PlatformContracts;
  export = api;
}
