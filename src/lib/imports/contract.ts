// CORE-9.3 · Versioned contract for manual imports (ADR 0005): `rubik-import-v1`.
//
// Pure validation, no I/O. An import is DECLARED data (method `import`): nothing here turns it
// into a verified provider result, and a missing value is never coerced into zero.
//
// Rejection of the whole file (nothing is stored): wrong size, not JSON, unknown format,
// unknown top-level keys, a scope that is not this project, an invalid source or date, and no
// findings array. Row problems never reject the file: each invalid finding is skipped and
// reported with its index, field and code, and the import is marked `partial` (some rows
// valid), `failed` (none valid) or `empty` (the file declares no findings).

export const IMPORT_FORMAT = "rubik-import-v1";
// Below the 1 MB default body limit of Server Actions, leaving room for multipart overhead.
export const MAX_IMPORT_BYTES = 900_000;
export const MAX_FINDINGS = 5_000;

export const SOURCE_KINDS = ["audit", "crawl-export", "offpage-inventory", "manual-review"] as const;
export const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;
export const FINDING_STATUSES = ["open", "resolved", "accepted-risk"] as const;

export type SourceKind = (typeof SOURCE_KINDS)[number];
export type Severity = (typeof SEVERITIES)[number];
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export interface ImportSource {
  kind: SourceKind;
  label: string;
  url: string | null;
  tool: string | null;
}

export interface Finding {
  url: string;
  ruleId: string;
  severity: Severity;
  title: string;
  observation: string;
  proposal: string | null;
  evidenceRef: string | null;
  status: FindingStatus;
}

export interface RowError {
  row: number;
  field: string;
  code: "REQUIRED" | "INVALID" | "TOO_LONG" | "UNKNOWN_FIELD" | "NOT_AN_OBJECT" | "DUPLICATE_ROW";
}

export interface ParsedImport {
  format: typeof IMPORT_FORMAT;
  source: ImportSource;
  capturedAt: string;
  period: { start: string; end: string } | null;
  findings: Finding[];
  errors: RowError[];
  status: ImportStatus;
}

/** `empty`: a valid file that declares no findings (an observation of "nothing found" is not zero of anything). */
export type ImportStatus = "complete" | "partial" | "failed" | "empty";

export type FileError =
  | "TOO_LARGE"
  | "EMPTY"
  | "NOT_JSON"
  | "NOT_AN_OBJECT"
  | "UNKNOWN_FORMAT"
  | "UNKNOWN_FIELD"
  | "SCOPE_MISMATCH"
  | "INVALID_SOURCE"
  | "INVALID_CAPTURED_AT"
  | "INVALID_PERIOD"
  | "FINDINGS_REQUIRED"
  | "TOO_MANY_FINDINGS";

const TOP_KEYS = new Set(["format", "scope", "source", "capturedAt", "period", "findings"]);
const SOURCE_KEYS = new Set(["kind", "label", "url", "tool"]);
const FINDING_KEYS = new Set(["url", "ruleId", "severity", "title", "observation", "proposal", "evidenceRef", "status"]);
const RULE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
// Date-time with an explicit offset; a bare date or a local time is ambiguous and refused.
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** An absolute http(s) URL without credentials; returned normalised (WHATWG URL). */
export function cleanUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw || raw.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password || !url.hostname.includes(".")) return null;
  return url.toString();
}

export function isoDateTime(value: unknown): string | null {
  const raw = text(value);
  if (!ISO_DATE_TIME.test(raw)) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

type Field<T> = { ok: true; value: T } | { ok: false; code: RowError["code"] };
function str(v: unknown, max: number, required: boolean): Field<string | null> {
  if (v === undefined || v === null || (typeof v === "string" && !v.trim())) return required ? { ok: false, code: "REQUIRED" } : { ok: true, value: null };
  if (typeof v !== "string") return { ok: false, code: "INVALID" };
  const t = v.trim();
  return t.length > max ? { ok: false, code: "TOO_LONG" } : { ok: true, value: t };
}

function parseFinding(raw: unknown, row: number, errors: RowError[]): Finding | null {
  if (!isObject(raw)) {
    errors.push({ row, field: "*", code: "NOT_AN_OBJECT" });
    return null;
  }
  const before = errors.length;
  for (const k of Object.keys(raw)) if (!FINDING_KEYS.has(k)) errors.push({ row, field: k.slice(0, 40), code: "UNKNOWN_FIELD" });
  const url = cleanUrl(raw.url);
  if (!url) errors.push({ row, field: "url", code: raw.url === undefined ? "REQUIRED" : "INVALID" });
  const ruleId = text(raw.ruleId);
  if (!RULE_ID.test(ruleId)) errors.push({ row, field: "ruleId", code: raw.ruleId === undefined ? "REQUIRED" : "INVALID" });
  const severity = SEVERITIES.find((s) => s === raw.severity);
  if (!severity) errors.push({ row, field: "severity", code: raw.severity === undefined ? "REQUIRED" : "INVALID" });
  const status = raw.status === undefined ? "open" : FINDING_STATUSES.find((s) => s === raw.status);
  if (!status) errors.push({ row, field: "status", code: "INVALID" });
  const fields = {
    title: str(raw.title, 200, true),
    observation: str(raw.observation, 2000, true),
    proposal: str(raw.proposal, 2000, false),
    evidenceRef: str(raw.evidenceRef, 300, false),
  };
  for (const [field, f] of Object.entries(fields)) if (!f.ok) errors.push({ row, field, code: f.code });
  if (errors.length > before) return null;
  return {
    url: url!,
    ruleId,
    severity: severity!,
    title: (fields.title as { value: string }).value,
    observation: (fields.observation as { value: string }).value,
    proposal: (fields.proposal as { value: string | null }).value,
    evidenceRef: (fields.evidenceRef as { value: string | null }).value,
    status: status!,
  };
}

/**
 * Parses and validates an import file for one project scope. `bytes` is the byte length of the
 * uploaded file (the size limit is about bytes, not characters).
 */
export function parseImport(
  input: string,
  scope: { tenantId: string; projectId: string },
  bytes = new TextEncoder().encode(input).length,
): { ok: true; import: ParsedImport } | { ok: false; error: FileError } {
  if (bytes > MAX_IMPORT_BYTES) return { ok: false, error: "TOO_LARGE" };
  if (!input.trim()) return { ok: false, error: "EMPTY" };
  let doc: unknown;
  try {
    doc = JSON.parse(input);
  } catch {
    return { ok: false, error: "NOT_JSON" };
  }
  if (!isObject(doc)) return { ok: false, error: "NOT_AN_OBJECT" };
  if (doc.format !== IMPORT_FORMAT) return { ok: false, error: "UNKNOWN_FORMAT" };
  if (Object.keys(doc).some((k) => !TOP_KEYS.has(k))) return { ok: false, error: "UNKNOWN_FIELD" };
  const declared = isObject(doc.scope) ? doc.scope : {};
  if (declared.tenantId !== scope.tenantId || declared.projectId !== scope.projectId || Object.keys(declared).length !== 2) {
    return { ok: false, error: "SCOPE_MISMATCH" };
  }

  const s = doc.source;
  if (!isObject(s) || Object.keys(s).some((k) => !SOURCE_KEYS.has(k))) return { ok: false, error: "INVALID_SOURCE" };
  const kind = SOURCE_KINDS.find((k) => k === s.kind);
  const label = str(s.label, 120, true);
  const tool = str(s.tool, 80, false);
  const sourceUrl = s.url === undefined || s.url === null ? null : cleanUrl(s.url);
  if (!kind || !label.ok || !tool.ok || (s.url !== undefined && s.url !== null && !sourceUrl)) return { ok: false, error: "INVALID_SOURCE" };

  const capturedAt = isoDateTime(doc.capturedAt);
  if (!capturedAt) return { ok: false, error: "INVALID_CAPTURED_AT" };

  let period: ParsedImport["period"] = null;
  if (doc.period !== undefined && doc.period !== null) {
    const p = doc.period;
    const start = isObject(p) ? isoDateTime(p.start) : null;
    const end = isObject(p) ? isoDateTime(p.end) : null;
    if (!isObject(p) || Object.keys(p).length !== 2 || !start || !end || end < start || end > capturedAt) return { ok: false, error: "INVALID_PERIOD" };
    period = { start, end };
  }

  if (!Array.isArray(doc.findings)) return { ok: false, error: "FINDINGS_REQUIRED" };
  if (doc.findings.length > MAX_FINDINGS) return { ok: false, error: "TOO_MANY_FINDINGS" };

  const errors: RowError[] = [];
  const findings: Finding[] = [];
  const seen = new Set<string>();
  doc.findings.forEach((raw, row) => {
    const f = parseFinding(raw, row, errors);
    if (!f) return;
    // The same rule on the same URL twice in one file is a duplicate row, not two findings.
    const key = `${f.url}\u0000${f.ruleId}`;
    if (seen.has(key)) {
      errors.push({ row, field: "ruleId", code: "DUPLICATE_ROW" });
      return;
    }
    seen.add(key);
    findings.push(f);
  });

  const status: ImportStatus = doc.findings.length === 0 ? "empty" : errors.length === 0 ? "complete" : findings.length > 0 ? "partial" : "failed";
  return {
    ok: true,
    import: {
      format: IMPORT_FORMAT,
      source: { kind: kind!, label: label.value!, url: sourceUrl, tool: tool.value },
      capturedAt,
      period,
      findings,
      errors,
      status,
    },
  };
}
