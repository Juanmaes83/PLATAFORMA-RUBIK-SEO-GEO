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

  /** Digest injected into signed provenance (D-28). Production uses {alg:'sha256'}. */
  export interface Digest {
    alg: string;
    hash(text: string): string;
  }

  export interface ProvenanceSigner {
    sign(canonical: string, options: { keyId: string | null }): string;
    verify(canonical: string, signature: string, options: { keyId: string | null }): boolean;
  }

  export interface SignedProvenance {
    payload: Record<string, unknown> & { dataHash: string; dataHashAlg: string };
    keyId: string | null;
    signature: string;
  }

  export interface ProvenanceVerification {
    trust: "SIGNED_PROVENANCE" | "UNTRUSTED";
    verified: boolean;
    reason: string | null;
    keyId?: string | null;
    dataHashAlg?: string;
    result?: Record<string, unknown>;
  }

  export interface AuditEvent {
    seq: number;
    at: string;
    actor: { role: Role; id: string | null };
    action: string;
    scope: Scope & { key: string };
    target: string | null;
    outcome: "allowed" | "denied" | "error";
    details: Record<string, string | number | boolean | null>;
    prevHash: string | null;
    hash: string;
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
    canonicalJson(value: unknown): string;
    auditEvent(
      previous: AuditEvent | null,
      input: {
        at: string;
        actor: { role: Role; id?: string | null };
        scope: { tenantId: string; projectId: string };
        action: string;
        target?: string | null;
        outcome?: "allowed" | "denied" | "error";
        details?: Record<string, string | number | boolean | null>;
      },
      options: { providers: unknown; hasher?: (text: string) => string },
    ): { ok: true; event: AuditEvent } | { ok: false; error: { code: string; [k: string]: unknown } };
    verifyAuditChain(
      events: AuditEvent[],
      options?: { hasher?: (text: string) => string },
    ): { valid: true; length: number } | { valid: false; brokenAt: number; reason: "SEQUENCE" | "LINK" | "HASH" };
    signProvenance(
      result: unknown,
      options: { providers: unknown; signer: ProvenanceSigner; keyId?: string | null; digest?: Digest },
    ): { ok: true; signed: SignedProvenance } | { ok: false; error: { code: string } };
    verifyProvenance(
      signed: SignedProvenance,
      options: { signer: ProvenanceSigner; data?: unknown; envelope?: unknown; digest?: Digest },
    ): ProvenanceVerification;
    isVerifiedProvenance(value: unknown): boolean;
  }

  const api: PlatformContracts;
  export = api;
}

declare module "@rubik/seo-geo-core/providers" {
  interface Providers {
    redact(text: string): string;
    isTrustedResult(value: unknown): boolean;
    runProviderRequest(input: Record<string, unknown>): Promise<ProviderResult>;
    openseoConnectivity(input: {
      health: unknown;
      mcp?: unknown;
      clock?: () => Date;
      whoamiAuthenticated?: (structuredContent: Readonly<Record<string, unknown>>) => boolean;
    }): Promise<OpenSeoConnectivity>;
  }
  export interface ProviderError {
    code: string;
    message: string;
    retryable: boolean;
    retryAfterSeconds?: number | null;
  }
  export interface ProviderResult {
    provider: string;
    operation: string;
    status: string;
    data: unknown[];
    partial: { reason: string | null; received: number; expected: number | null; rejected: number; capped: number; truncated: boolean } | null;
    errors: ProviderError[];
    connection: "VERIFIED" | "NOT_VERIFIED";
    provenance: { capturedAt: string; requestedAt: string; method: string; evidence: Record<string, unknown> } | null;
    [k: string]: unknown;
  }
  export interface OpenSeoConnectivity {
    status: "NOT_CONFIGURED" | "NOT_CONNECTED" | "CONNECTED" | "ERROR";
    health: string | null;
    authorization: "VERIFIED" | "NOT_VERIFIED" | "REJECTED";
    reason?: string;
    checkedAt?: string | null;
    failingChecks?: string[];
    error?: ProviderError | string | null;
  }
  const api: Providers;
  export = api;
}

declare module "@rubik/seo-geo-core/offpage" {
  interface Offpage {
    measurement(
      input: unknown,
      options: { providers: unknown; dimension?: string; platform?: unknown },
    ): { status: string; trust: string; verified: boolean; method: string; rows: unknown[]; [k: string]: unknown };
  }
  const api: Offpage;
  export = api;
}

declare module "@rubik/seo-geo-core/intelligence" {
  interface OpenSEOHealth {
    status: string;
    health?: string;
    failingChecks?: string[];
    error?: string;
    [k: string]: unknown;
  }
  interface Intelligence {
    OpenSEOAdapter: new (options: {
      endpoint: string;
      fetchImpl?: (input: string, init: RequestInit) => Promise<Response>;
      timeout?: number;
    }) => { connectivity(): Promise<OpenSEOHealth> };
  }
  const api: Intelligence;
  export = api;
}
