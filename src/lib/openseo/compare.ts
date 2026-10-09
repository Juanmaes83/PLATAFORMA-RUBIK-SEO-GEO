// Comparison of two signed OpenSEO issue results of the SAME project (CORE-9.6, first tranche).
// Pure and local: it only reads results that already passed `openProviderResult`. It never calls
// OpenSEO, never consumes credits and never infers causes: a difference is reported as observed.

/** Normalized by the Core (`OPENSEO_SEVERITY`): critical → ERROR, warning → WARNING, info → OPPORTUNITY. */
export type Severity = "ERROR" | "WARNING" | "OPPORTUNITY" | "UNKNOWN";

export interface ComparedIssue {
  url: string;
  category: string;
  severity: Severity;
}

export interface SeverityChange extends ComparedIssue {
  before: Severity;
}

export interface AuditSide {
  auditId: string | null;
  capturedAt: string | null;
  status: string;
  partial: boolean;
  issues: ComparedIssue[];
}

export interface AuditComparison {
  before: Omit<AuditSide, "issues"> & { total: number };
  after: Omit<AuditSide, "issues"> & { total: number };
  resolved: ComparedIssue[];
  added: ComparedIssue[];
  changed: SeverityChange[];
  unchanged: number;
  bySeverity: Record<Severity, { before: number; after: number }>;
  /** Reasons why the difference may not reflect the site: partial or truncated captures. */
  caveats: string[];
}

const SEVERITIES: readonly Severity[] = ["ERROR", "WARNING", "OPPORTUNITY", "UNKNOWN"];
const severityOf = (value: unknown): Severity => (SEVERITIES as readonly string[]).includes(value as string) ? value as Severity : "UNKNOWN";

/** Host in lower case, no fragment: the same page captured twice must produce the same key. */
function normalizeUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/** Reads a verified ProviderResult of operation `auditIssues`; anything else is rejected. */
export function auditSide(result: unknown): AuditSide | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  if (r.provider !== "openseo" || r.operation !== "auditIssues" || !Array.isArray(r.data)) return null;
  const provenance = (r.provenance ?? {}) as Record<string, unknown>;
  const evidence = (provenance.evidence ?? {}) as Record<string, unknown>;
  const issues: ComparedIssue[] = [];
  for (const row of r.data) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const url = typeof item.url === "string" ? normalizeUrl(item.url) : null;
    if (!url || typeof item.category !== "string" || !item.category) continue;
    issues.push({ url, category: item.category, severity: severityOf(item.severity) });
  }
  return {
    auditId: typeof evidence.auditId === "string" ? evidence.auditId : null,
    capturedAt: typeof provenance.capturedAt === "string" ? provenance.capturedAt : null,
    status: typeof r.status === "string" ? r.status : "UNKNOWN",
    partial: r.status !== "OK" || !!r.partial,
    issues,
  };
}

const keyOf = (issue: ComparedIssue) => `${issue.category}\u0000${issue.url}`;
const byKey = (a: ComparedIssue, b: ComparedIssue) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || a.category.localeCompare(b.category) || a.url.localeCompare(b.url);

function index(issues: ComparedIssue[]): Map<string, ComparedIssue> {
  const map = new Map<string, ComparedIssue>();
  for (const issue of issues) {
    const known = map.get(keyOf(issue));
    // Duplicates keep the most severe reading so a downgrade is never invented.
    if (!known || SEVERITIES.indexOf(issue.severity) < SEVERITIES.indexOf(known.severity)) map.set(keyOf(issue), issue);
  }
  return map;
}

/** An issue is identified by category + URL; severity changes are reported, not hidden. */
export function compareAudits(before: AuditSide, after: AuditSide): AuditComparison {
  const a = index(before.issues);
  const b = index(after.issues);
  const resolved: ComparedIssue[] = [];
  const added: ComparedIssue[] = [];
  const changed: SeverityChange[] = [];
  let unchanged = 0;
  for (const [key, issue] of a) {
    const next = b.get(key);
    if (!next) resolved.push(issue);
    else if (next.severity !== issue.severity) changed.push({ ...next, before: issue.severity });
    else unchanged += 1;
  }
  for (const [key, issue] of b) if (!a.has(key)) added.push(issue);

  const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, { before: 0, after: 0 }])) as AuditComparison["bySeverity"];
  for (const issue of a.values()) bySeverity[issue.severity].before += 1;
  for (const issue of b.values()) bySeverity[issue.severity].after += 1;

  const caveats: string[] = [];
  if (before.partial) caveats.push("La captura anterior es parcial o está truncada: una incidencia «resuelta» puede no haberse leído.");
  if (after.partial) caveats.push("La captura posterior es parcial o está truncada: una incidencia ausente puede no haberse leído.");
  if (before.auditId && before.auditId === after.auditId) caveats.push("Ambos resultados pertenecen a la misma auditoría.");

  const side = (s: AuditSide, map: Map<string, ComparedIssue>) => ({ auditId: s.auditId, capturedAt: s.capturedAt, status: s.status, partial: s.partial, total: map.size });
  return {
    before: side(before, a),
    after: side(after, b),
    resolved: resolved.sort(byKey),
    added: added.sort(byKey),
    changed: changed.sort(byKey),
    unchanged,
    bySeverity,
    caveats,
  };
}

/** Earlier capture first; results without a capture date keep the order they were given. */
export function chronological(x: AuditSide, y: AuditSide): [AuditSide, AuditSide] {
  if (x.capturedAt && y.capturedAt && Date.parse(y.capturedAt) < Date.parse(x.capturedAt)) return [y, x];
  return [x, y];
}
