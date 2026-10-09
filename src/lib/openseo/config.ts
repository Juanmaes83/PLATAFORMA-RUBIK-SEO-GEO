import "server-only";

// OpenSEO bridge configuration (ADR 0006). Read only on the server, from server-only variables:
// none of them has the NEXT_PUBLIC_ prefix, so Next.js never inlines them into the browser
// bundle. The API key is held in a closure-free plain object that is never returned to a
// client, written to the database or logged. `describeOpenSeoConfig` is the only view of the
// configuration that may leave this module, and it carries no values, only states.

type Env = Record<string, string | undefined>;

/** Hard ceiling for `maxPages`, whatever the environment says (OpenSEO accepts 10–10 000). */
export const MAX_PAGES_CEILING = 500;
export const MIN_PAGES = 10;
const DEFAULT_MAX_PAGES = 50;

export interface StatusVocabulary {
  completed: string[];
  failed: string[];
  pending: string[];
}

export interface OpenSeoConfig {
  /** Base HTTPS URL of the OpenSEO app; MCP at /mcp and health at /api/health. */
  endpoint: string;
  mcpUrl: string;
  apiKey: string;
  /** OpenSEO project that owns the audits. Server-side only, never in the Project State. */
  projectId: string;
  /** Hosts a manual audit may target. Empty: no audit can start. */
  allowedHosts: string[];
  /** Upper bound for maxPages on this server (≤ MAX_PAGES_CEILING). */
  maxPages: number;
  /** Top-level whoami field that must be a non-empty string to confirm authentication. */
  whoamiField: string | null;
  statusVocabulary: StatusVocabulary;
}

export type OpenSeoConfigState =
  | { state: "not-configured"; missing: string[] }
  | { state: "invalid"; problems: string[] }
  | { state: "configured"; config: OpenSeoConfig };

const list = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);

/** A hostname that may be audited: public DNS name, never an IP, localhost or a preview. */
export function isAuditableHostname(host: string): boolean {
  if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) return false;
  return !PREVIEW_HOST.test(host);
}

// Preview and deployment hosts are refused even when listed: they are protected or must not
// be crawled (vercel.app previews, Netlify deploy previews and similar).
const PREVIEW_HOST = /(^|\.)(vercel\.app|vercel\.sh|now\.sh|netlify\.app|pages\.dev|web\.app|firebaseapp\.com|onrender\.com|herokuapp\.com|ngrok\.io|ngrok-free\.app|localhost)$/;

/** Rejects an OpenSEO-looking key in any variable the browser would receive. */
export function publicOpenSeoLeak(env: Env): string | null {
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith("NEXT_PUBLIC_")) continue;
    if (/OPENSEO/i.test(name) || (value ?? "").trim().startsWith("oseo_")) return name;
  }
  return null;
}

/** Google reads resolve the OpenSEO project from an ACTIVE per-project association. */
export function readOpenSeoMcpConfig(env: Env = process.env):
  | { state: "configured"; mcpUrl: string; apiKey: string }
  | { state: "not-configured" | "invalid" } {
  if (publicOpenSeoLeak(env)) return { state: "invalid" };
  const endpointRaw = (env.OPENSEO_ENDPOINT ?? "").trim();
  const apiKey = (env.OPENSEO_API_KEY ?? "").trim();
  if (!endpointRaw || !apiKey) return { state: "not-configured" };
  if (!/^oseo_[A-Za-z0-9_-]{8,}$/.test(apiKey)) return { state: "invalid" };
  try {
    const url = new URL(endpointRaw);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return { state: "invalid" };
    return { state: "configured", mcpUrl: `${url.origin}${url.pathname.replace(/\/+$/, "")}/mcp`, apiKey };
  } catch { return { state: "invalid" }; }
}

export function readOpenSeoConfig(env: Env = process.env): OpenSeoConfigState {
  const leak = publicOpenSeoLeak(env);
  if (leak) return { state: "invalid", problems: [`${leak} no puede contener datos de OpenSEO: las variables NEXT_PUBLIC_* llegan al navegador.`] };

  const endpointRaw = (env.OPENSEO_ENDPOINT ?? "").trim();
  const apiKey = (env.OPENSEO_API_KEY ?? "").trim();
  const projectId = (env.OPENSEO_PROJECT_ID ?? "").trim();
  const missing = [
    ["OPENSEO_ENDPOINT", endpointRaw],
    ["OPENSEO_API_KEY", apiKey],
    ["OPENSEO_PROJECT_ID", projectId],
  ]
    .filter(([, v]) => !v)
    .map(([n]) => n);
  if (missing.length === 3) return { state: "not-configured", missing };

  const problems: string[] = [];
  if (missing.length) problems.push(`Faltan: ${missing.join(", ")}.`);

  let endpoint = "";
  try {
    const u = new URL(endpointRaw);
    if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash) throw new Error();
    endpoint = u.origin + u.pathname.replace(/\/+$/, "");
  } catch {
    if (endpointRaw) problems.push("OPENSEO_ENDPOINT debe ser una URL https sin credenciales, consulta ni fragmento.");
  }
  if (apiKey && !/^oseo_[A-Za-z0-9_-]{8,}$/.test(apiKey)) problems.push("OPENSEO_API_KEY no tiene el formato de una clave de OpenSEO.");
  if (projectId && !/^[A-Za-z0-9_-]{1,100}$/.test(projectId)) problems.push("OPENSEO_PROJECT_ID no es un identificador válido.");

  const allowedHosts = list(env.OPENSEO_AUDIT_ALLOWED_HOSTS);
  const badHosts = allowedHosts.filter((h) => !isAuditableHostname(h));
  if (badHosts.length) problems.push("OPENSEO_AUDIT_ALLOWED_HOSTS contiene hosts no auditables (IP, localhost o previews).");

  const maxRaw = (env.OPENSEO_AUDIT_MAX_PAGES ?? "").trim();
  const maxPages = maxRaw ? Number(maxRaw) : DEFAULT_MAX_PAGES;
  if (!Number.isInteger(maxPages) || maxPages < MIN_PAGES || maxPages > MAX_PAGES_CEILING) {
    problems.push(`OPENSEO_AUDIT_MAX_PAGES debe ser un entero entre ${MIN_PAGES} y ${MAX_PAGES_CEILING}.`);
  }

  const whoamiField = (env.OPENSEO_WHOAMI_IDENTITY_FIELD ?? "").trim() || null;
  if (whoamiField && !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(whoamiField)) problems.push("OPENSEO_WHOAMI_IDENTITY_FIELD debe ser un nombre de campo simple.");

  if (problems.length) return { state: "invalid", problems };
  return {
    state: "configured",
    config: {
      endpoint,
      mcpUrl: `${endpoint}/mcp`,
      apiKey,
      projectId,
      allowedHosts,
      maxPages,
      whoamiField,
      statusVocabulary: {
        completed: list(env.OPENSEO_AUDIT_STATUS_COMPLETED),
        failed: list(env.OPENSEO_AUDIT_STATUS_FAILED),
        pending: list(env.OPENSEO_AUDIT_STATUS_PENDING),
      },
    },
  };
}

/** What the UI may know about the configuration: states and limits, never values. */
export interface OpenSeoConfigView {
  state: OpenSeoConfigState["state"];
  problems: string[];
  missing: string[];
  maxPages: number | null;
  allowedHostCount: number;
  whoamiVerifier: boolean;
  statusVocabulary: boolean;
}

export function describeOpenSeoConfig(s: OpenSeoConfigState): OpenSeoConfigView {
  if (s.state === "configured") {
    const v = s.config.statusVocabulary;
    return {
      state: s.state,
      problems: [],
      missing: [],
      maxPages: s.config.maxPages,
      allowedHostCount: s.config.allowedHosts.length,
      whoamiVerifier: s.config.whoamiField !== null,
      statusVocabulary: v.completed.length > 0 && v.failed.length > 0,
    };
  }
  return {
    state: s.state,
    problems: s.state === "invalid" ? s.problems : [],
    missing: s.state === "not-configured" ? s.missing : [],
    maxPages: null,
    allowedHostCount: 0,
    whoamiVerifier: false,
    statusVocabulary: false,
  };
}
