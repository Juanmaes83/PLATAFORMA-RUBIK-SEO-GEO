import "server-only";

// OpenSEO bridge (ADR 0006): the server-side half of the Core's CORE-7.1 contract. The Core
// (`providers.runProviderRequest` and `providers.openseoConnectivity`, D-22) decides the tool
// arguments, the honest states and the normalization; this module only supplies what the
// Core leaves to the host: the authenticated MCP client, the health check, the OpenSEO
// project id, the whoami verifier, the status vocabulary and the audit target rules.
//
// Every function returns plain data safe to send to the browser: no key, no endpoint, no
// OpenSEO project id and nothing copied from whoami.
import intelligence from "@rubik/seo-geo-core/intelligence";
import type { ProviderError, ProviderResult } from "@rubik/seo-geo-core/providers";
import { providers } from "@/lib/core";
import { MIN_PAGES, isAuditableHostname, readOpenSeoConfig, type OpenSeoConfig, type OpenSeoConfigState } from "./config";
import { createOpenSeoMcpClient, type FetchLike, type OpenSeoMcpClient } from "./mcp-client";

export interface BridgeDeps {
  env?: Record<string, string | undefined>;
  fetchImpl?: FetchLike;
  clock?: () => Date;
  /** Loaded server-side from this Rubik project's job binding, never from form data. */
  activeJob?: ActiveAuditJob | null;
  /** When present, only this server-side project binding may be followed. */
  boundAuditId?: string | null;
}

export type BridgeError = { code: string; message: string; retryable: boolean; diagnostic?: string };

const AUDIT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const ISSUE_LIMIT = 200;

const noRedirectFetch = (fetchImpl?: FetchLike): FetchLike => (input, init) =>
  (fetchImpl ?? ((i, n) => fetch(i, n)))(input, { ...init, redirect: "error", cache: "no-store" });

const cleanError = (e: ProviderError | undefined | null): BridgeError | null =>
  e ? { code: e.code, message: providers.redact(String(e.message ?? "")).slice(0, 200), retryable: e.retryable === true } : null;

function configured(deps: BridgeDeps): { config: OpenSeoConfig } | { error: BridgeError; state: OpenSeoConfigState["state"] } {
  const s = readOpenSeoConfig(deps.env ?? process.env);
  if (s.state === "configured") return { config: s.config };
  return { state: s.state, error: { code: s.state === "invalid" ? "CONFIG_INVALID" : "NOT_CONFIGURED", message: "OpenSEO no está configurado en el servidor.", retryable: false } };
}

function client(config: OpenSeoConfig, deps: BridgeDeps): OpenSeoMcpClient {
  return createOpenSeoMcpClient({ mcpUrl: config.mcpUrl, apiKey: config.apiKey, maxPages: config.maxPages, fetchImpl: noRedirectFetch(deps.fetchImpl) });
}

async function withClient<T>(config: OpenSeoConfig, deps: BridgeDeps, run: (mcp: OpenSeoMcpClient) => Promise<T>): Promise<T> {
  const mcp = client(config, deps);
  try {
    return await run(mcp);
  } finally {
    await mcp.close();
  }
}

/** whoami verifier: the configured top-level field must be a non-empty string. Nothing is copied. */
export function whoamiVerifier(field: string | null) {
  if (!field) return undefined;
  return (sc: Readonly<Record<string, unknown>>) => typeof sc[field] === "string" && (sc[field] as string).trim().length > 0;
}

// ── Connection test ──────────────────────────────────────────────────────────────────────

export interface ConnectionReport {
  status: "NOT_CONFIGURED" | "NOT_CONNECTED" | "CONNECTED" | "ERROR";
  health: "ok" | "issues" | "unreachable" | null;
  authorization: "VERIFIED" | "NOT_VERIFIED" | "REJECTED";
  reason: string | null;
  failingChecks: string[];
  /** Top-level field NAMES of whoami (never values), only while the verifier is not configured. */
  whoamiFields: string[];
  checkedAt: string | null;
  error: BridgeError | null;
}

export async function testOpenSeoConnection(deps: BridgeDeps = {}): Promise<ConnectionReport> {
  const c = configured(deps);
  if ("error" in c) return { status: c.state === "invalid" ? "ERROR" : "NOT_CONFIGURED", health: null, authorization: "NOT_VERIFIED", reason: c.error.code, failingChecks: [], whoamiFields: [], checkedAt: null, error: c.error };
  const { config } = c;

  const adapter = new intelligence.OpenSEOAdapter({ endpoint: config.endpoint, fetchImpl: noRedirectFetch(deps.fetchImpl), timeout: 8000 });
  const health = await adapter.connectivity();
  let whoamiFields: string[] = [];

  const report = await withClient(config, deps, async (live) => {
    // Observe only the field names of whoami so the owner can choose the verifier field.
    const observed = {
      kind: live.kind,
      callTool: async (name: string, args: Record<string, unknown>) => {
        const res = await live.callTool(name, args);
        const sc = res?.structuredContent;
        if (name === "whoami" && !config.whoamiField && sc && typeof sc === "object" && !Array.isArray(sc)) {
          whoamiFields = Object.keys(sc).filter((k) => /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(k)).slice(0, 20);
        }
        return res;
      },
    };
    return providers.openseoConnectivity({ health, mcp: observed, clock: deps.clock, whoamiAuthenticated: whoamiVerifier(config.whoamiField) });
  });

  const err = typeof report.error === "string" ? { code: "HEALTH", message: providers.redact(report.error).slice(0, 200), retryable: true } : cleanError(report.error);
  const healthState = report.health === "ok" || report.health === "issues" ? report.health : health.status === "ERROR" && !health.health ? "unreachable" : null;
  return {
    status: report.status,
    health: healthState,
    authorization: report.authorization,
    reason: report.reason ?? null,
    failingChecks: (report.failingChecks ?? []).slice(0, 20),
    whoamiFields: config.whoamiField ? [] : whoamiFields,
    checkedAt: report.checkedAt ?? null,
    error: err,
  };
}

// ── Audit target ─────────────────────────────────────────────────────────────────────────

export type TargetCheck = { ok: true; url: string } | { ok: false; code: "INVALID_URL" | "NOT_HTTPS" | "HOST_NOT_AUDITABLE" | "HOST_NOT_ALLOWED" | "NOT_PROJECT_DOMAIN" };

const hostOf = (domain: string | null) => {
  if (!domain) return "";
  try {
    return new URL(/^https?:\/\//i.test(domain) ? domain : `https://${domain}`).hostname.toLowerCase();
  } catch {
    return "";
  }
};

/**
 * A manual audit may only target an https URL whose host is (1) a public DNS name that is not
 * a preview or deployment host, (2) listed in OPENSEO_AUDIT_ALLOWED_HOSTS and (3) the domain of
 * the project the user is acting on. Credentials, query strings and fragments are dropped.
 */
export function checkAuditTarget(raw: string, allowedHosts: readonly string[], projectDomain: string | null): TargetCheck {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, code: "INVALID_URL" };
  }
  if (u.protocol !== "https:") return { ok: false, code: "NOT_HTTPS" };
  if (u.username || u.password || u.port) return { ok: false, code: "INVALID_URL" };
  const host = u.hostname.toLowerCase();
  if (!isAuditableHostname(host)) return { ok: false, code: "HOST_NOT_AUDITABLE" };
  if (!allowedHosts.includes(host)) return { ok: false, code: "HOST_NOT_ALLOWED" };
  if (hostOf(projectDomain) !== host) return { ok: false, code: "NOT_PROJECT_DOMAIN" };
  return { ok: true, url: `https://${host}${u.pathname}` };
}

/** Whether this project can launch audits on this server at all (for the UI). */
export function projectAuditable(projectDomain: string | null, env?: Record<string, string | undefined>): boolean {
  const s = readOpenSeoConfig(env ?? process.env);
  const host = hostOf(projectDomain);
  return s.state === "configured" && !!host && isAuditableHostname(host) && s.config.allowedHosts.includes(host);
}

// ── Audit lifecycle ──────────────────────────────────────────────────────────────────────

export interface AuditStart {
  ok: boolean;
  auditId: string | null;
  url: string | null;
  maxPages: number | null;
  startedAt: string | null;
  reused: boolean;
  error: BridgeError | null;
}

export interface ActiveAuditJob {
  jobId: string;
  auditId: string;
  state: "SYNCING";
}

export async function startSiteAudit(input: { url: string; maxPages: number; projectDomain: string | null }, deps: BridgeDeps = {}): Promise<AuditStart> {
  const fail = (error: BridgeError): AuditStart => ({ ok: false, auditId: null, url: null, maxPages: null, startedAt: null, reused: false, error });
  const c = configured(deps);
  if ("error" in c) return fail(c.error);
  const { config } = c;
  const target = checkAuditTarget(input.url, config.allowedHosts, input.projectDomain);
  if (!target.ok) return fail({ code: target.code, message: "Destino de auditoría no permitido.", retryable: false });
  if (!Number.isInteger(input.maxPages) || input.maxPages < MIN_PAGES || input.maxPages > config.maxPages) {
    return fail({ code: "MAX_PAGES_NOT_ALLOWED", message: `El límite de páginas debe estar entre ${MIN_PAGES} y ${config.maxPages}.`, retryable: false });
  }
  const activeJob = deps.activeJob ?? null;
  if (activeJob && (activeJob.state !== "SYNCING" || activeJob.jobId !== activeJob.auditId || !AUDIT_ID.test(activeJob.auditId))) {
    return fail({ code: "INVALID_ACTIVE_JOB", message: "El trabajo activo del proyecto no es válido.", retryable: false });
  }
  const r = await withClient(config, deps, (mcp) =>
    providers.runProviderRequest({
      provider: "openseo",
      operation: "siteAudit",
      input: { projectId: config.projectId, url: target.url, maxPages: input.maxPages, runLighthouse: false, trigger: "manual" },
      mcp,
      clock: deps.clock,
      activeJob,
    }),
  );
  const job = (r.status === "OK" ? r.data[0] : null) as { auditId?: string; startedAt?: string; maxPages?: number; url?: string; reused?: boolean } | null;
  if (!job?.auditId) return fail(cleanError(r.errors[0]) ?? { code: r.status, message: "OpenSEO no inició la auditoría.", retryable: false });
  return { ok: true, auditId: job.auditId, url: job.url ?? target.url, maxPages: job.maxPages ?? input.maxPages, startedAt: job.startedAt ?? null, reused: job.reused === true, error: null };
}

export interface AuditProgress {
  ok: boolean;
  /** Core job state: SYNCING, COMPLETED, FAILED or UNCLASSIFIED. */
  state: string | null;
  providerStatus: string | null;
  phase: string | null;
  pagesCrawled: number | null;
  pagesTotal: number | null;
  checkedAt: string | null;
  error: BridgeError | null;
}

export interface NormalizedIssue {
  id: string;
  url: string;
  category: string;
  severity: "ERROR" | "WARNING" | "OPPORTUNITY";
  crawlAccess: string | null;
}

export interface AuditReport {
  status: string;
  issues: NormalizedIssue[];
  issuesPartial: { reason: string | null; rejected: number; truncated: boolean } | null;
  pages: { url: string }[];
  pagesTotal: number | null;
  pagesPartial: { reason: string | null; rejected: number; truncated: boolean } | null;
  capturedAt: string | null;
  method: string | null;
  /** Rows dropped because their host is not the project's domain. */
  outsideProject: number;
  hiddenIssues: number;
  hiddenPages: number;
  errors: BridgeError[];
}

export interface AuditFollowUp {
  progress: AuditProgress;
  /** Only when the Core classifies the audit as COMPLETED. */
  report: AuditReport | null;
}


/** Only field names and types; no values, raw MCP text, URLs, IDs or credentials. */
export function auditResponseShape(value: unknown): string {
  const entries: string[] = [];
  const visit = (v: unknown, path: string, depth: number) => {
    const type = v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
    entries.push(path + "=" + type);
    if (type !== "object" || depth >= 2 || !v) return;
    for (const key of Object.keys(v).sort().slice(0, 20)) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key) || providers.redact(key) !== key || /oseo_/i.test(key)) continue;
      visit((v as Record<string, unknown>)[key], path + "." + key, depth + 1);
    }
  };
  visit(value, "root", 0);
  return entries.join("; ").slice(0, 1000);
}

const partialOf = (r: ProviderResult) => (r.partial ? { reason: r.partial.reason, rejected: r.partial.rejected, truncated: r.partial.truncated } : null);
const scopeFilteredOf = (r: ProviderResult) => {
  const n = r.provenance?.evidence?.scopeFiltered;
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : 0;
};

/**
 * One status check and, when the audit is complete, its issues and pages normalized by the
 * Core. Rows whose host is not the project's domain are dropped and counted: an audit id from
 * another project never shows its URLs here.
 */
export async function followSiteAudit(auditIdRaw: string, projectDomain: string | null, deps: BridgeDeps = {}): Promise<AuditFollowUp> {
  const empty = (error: BridgeError): AuditFollowUp => ({ progress: { ok: false, state: null, providerStatus: null, phase: null, pagesCrawled: null, pagesTotal: null, checkedAt: null, error }, report: null });
  const c = configured(deps);
  if ("error" in c) return empty(c.error);
  const { config } = c;
  const auditId = auditIdRaw.trim();
  if (!AUDIT_ID.test(auditId)) return empty({ code: "INVALID_AUDIT_ID", message: "Identificador de auditoría no válido.", retryable: false });
  // `undefined` preserves the first-tranche behaviour. Once the job repository is wired,
  // `null` or a mismatch fail closed before any OpenSEO request.
  if (deps.boundAuditId !== undefined && (!deps.boundAuditId || !AUDIT_ID.test(deps.boundAuditId) || deps.boundAuditId !== auditId)) {
    return empty({ code: "AUDIT_NOT_BOUND", message: "La auditoría no pertenece a este proyecto.", retryable: false });
  }

  return withClient(config, deps, async (mcp) => {
    let responseShape = "";
    const observed = {
      kind: mcp.kind,
      callTool: async (name: string, args: Record<string, unknown>) => {
        const result = await mcp.callTool(name, args);
        if (name === "get_audit_status") responseShape = auditResponseShape(result.structuredContent);
        return result;
      },
    };
    const base = { provider: "openseo", mcp: observed, clock: deps.clock };
    const s = await providers.runProviderRequest({ ...base, operation: "auditStatus", input: { projectId: config.projectId, auditId }, statusVocabulary: config.statusVocabulary });
    const row = (s.data[0] ?? null) as { state?: string; providerStatus?: string; phase?: string | null; pagesCrawled?: number | null; pagesTotal?: number | null } | null;
    const progress: AuditProgress = {
      ok: s.status === "OK" || s.status === "PARTIAL",
      state: row?.state ?? null,
      providerStatus: row?.providerStatus ?? null,
      phase: row?.phase ?? null,
      pagesCrawled: row?.pagesCrawled ?? null,
      pagesTotal: row?.pagesTotal ?? null,
      checkedAt: s.provenance?.capturedAt ?? null,
      error: cleanError(s.errors[0]),
    };
    if (progress.error?.code === "INVALID_RESPONSE") progress.error.diagnostic = responseShape;
    if (row?.state !== "COMPLETED") return { progress, report: null };

    const host = hostOf(projectDomain);
    const onProject = (url: string) => {
      try {
        const rowHost = new URL(url).hostname.toLowerCase();
        if (!host) return false;
        if (rowHost === host) return true;
        // Only the explicit www/apex companion can join this project's report.
        // Arbitrary subdomains and other clients remain excluded.
        const companion = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
        return rowHost === companion && config.allowedHosts.includes(companion);
      } catch {
        return false;
      }
    };
    // Scope inside the Core before it issues the trusted ProviderResult. Post-filtering a
    // trusted result would either retain foreign rows for signing or require rebuilding it.
    const issues = await providers.runProviderRequest({
      ...base,
      operation: "auditIssues",
      input: { projectId: config.projectId, auditId, limit: ISSUE_LIMIT },
      acceptUrl: (url: string) => !url || onProject(url),
    });
    const pages = await providers.runProviderRequest({
      ...base,
      operation: "auditPages",
      input: { projectId: config.projectId, auditId },
      maxRows: config.maxPages,
      acceptUrl: onProject,
    });
    const allIssues = issues.data as { url: string }[];
    const allPages = pages.data as { url: string }[];
    const issueRows = (allIssues as { id: string; url: string; category: string; severity: NormalizedIssue["severity"]; evidence?: { crawlAccess?: string } }[]).map((i) => ({
      id: i.id,
      url: i.url,
      category: i.category,
      severity: i.severity,
      crawlAccess: i.evidence?.crawlAccess ?? null,
    }));
    const hiddenIssues = scopeFilteredOf(issues);
    const hiddenPages = scopeFilteredOf(pages);
    const report: AuditReport = {
      status: issues.status,
      issues: issueRows,
      issuesPartial: partialOf(issues),
      pages: allPages.map((p) => ({ url: p.url })),
      pagesTotal: typeof pages.provenance?.evidence?.total === "number" ? (pages.provenance.evidence.total as number) : null,
      pagesPartial: partialOf(pages),
      capturedAt: issues.provenance?.capturedAt ?? null,
      method: issues.provenance?.method ?? null,
      outsideProject: hiddenIssues + hiddenPages,
      hiddenIssues,
      hiddenPages,
      errors: [...issues.errors, ...pages.errors].map((e) => cleanError(e)).filter((e): e is BridgeError => e !== null),
    };
    return { progress, report };
  });
}
