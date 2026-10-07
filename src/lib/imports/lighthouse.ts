// Normalises a Lighthouse result (LHR JSON) into a `rubik-import-v1` file (ADR 0005).
//
// Pure, no I/O. The output is DECLARED data: an import, never a verified provider result.
// Only audits that Lighthouse scored below the pass threshold become findings; an audit it
// could not score (`score: null`) is left out rather than turned into a failure or a zero.
//
// Deliberately no runtime import from ./contract: the CLI (scripts/lighthouse-to-import.mjs)
// loads this file with Node's type stripping, which does not resolve extensionless imports.
// The tests check every output against `parseImport`.

import type { FindingStatus, Severity } from "./contract";

export const LIGHTHOUSE_PASS = 0.9;
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"] as const;

export type MeasurementEnvironment = "LOCAL" | "PREVIEW" | "PRODUCTION" | "PAGESPEED";

interface LhAudit {
  id?: string;
  title?: string;
  description?: string;
  score?: number | null;
  scoreDisplayMode?: string;
  displayValue?: string;
}
interface LhCategory {
  auditRefs?: { id: string; weight?: number }[];
}
export interface LighthouseResult {
  lighthouseVersion?: string;
  fetchTime?: string;
  finalDisplayedUrl?: string;
  configSettings?: { formFactor?: string };
  categories?: Record<string, LhCategory>;
  audits?: Record<string, LhAudit>;
}

export interface LighthouseImportOptions {
  scope: { tenantId: string; projectId: string };
  environment: MeasurementEnvironment;
  /**
   * The URL the finding is recorded against. A LOCAL run measures `http://localhost…`, which the
   * contract refuses (no public host); the caller states which public URL the build represents.
   * The measured URL is kept in the observation.
   */
  findingUrl?: string;
  /** Rule ids (`lh.<formFactor>.<auditId>`) the owner already accepted, e.g. noindex on a preview. */
  acceptedRuleIds?: string[];
  /** Pointer to the stored report, e.g. a file name; never the report itself. */
  evidenceRef?: string;
}

export interface RubikImportFile {
  format: "rubik-import-v1";
  scope: { tenantId: string; projectId: string };
  source: { kind: "audit"; label: string; url: null; tool: string };
  capturedAt: string;
  findings: {
    url: string;
    ruleId: string;
    severity: Severity;
    title: string;
    observation: string;
    proposal: string | null;
    evidenceRef: string | null;
    status: FindingStatus;
  }[];
}

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
// Lighthouse descriptions are Markdown with "[Learn more](…)" links; keep the plain sentence.
const plain = (md: string) => md.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/`/g, "").trim();

function severityFor(score: number): Severity {
  return score < 0.5 ? "high" : "medium";
}

export function lighthouseToImport(lhr: LighthouseResult, opts: LighthouseImportOptions): RubikImportFile {
  const measuredUrl = lhr.finalDisplayedUrl ?? "";
  const formFactor = lhr.configSettings?.formFactor === "desktop" ? "desktop" : "mobile";
  const version = lhr.lighthouseVersion ?? "unknown";
  const accepted = new Set(opts.acceptedRuleIds ?? []);
  const url = opts.findingUrl ?? measuredUrl;
  const findings: RubikImportFile["findings"] = [];
  const seen = new Set<string>();

  for (const category of CATEGORIES) {
    for (const ref of lhr.categories?.[category]?.auditRefs ?? []) {
      const audit = lhr.audits?.[ref.id];
      // Weight 0 audits are informative in Lighthouse and do not affect the category score.
      if (!audit || !ref.weight || typeof audit.score !== "number" || audit.score >= LIGHTHOUSE_PASS) continue;
      const ruleId = `lh.${formFactor}.${ref.id}`.slice(0, 64);
      if (seen.has(ruleId)) continue;
      seen.add(ruleId);
      const value = audit.displayValue ? ` Valor: ${audit.displayValue}.` : "";
      findings.push({
        url,
        ruleId,
        severity: severityFor(audit.score),
        title: clip(`${category}: ${audit.title ?? ref.id}`, 200),
        observation: clip(
          `Lighthouse ${version} (${formFactor}, entorno ${opts.environment}) puntúa ${audit.score} sobre 1 en «${ref.id}».${value} URL medida: ${measuredUrl}.`,
          2000,
        ),
        proposal: audit.description ? clip(plain(audit.description), 2000) : null,
        evidenceRef: opts.evidenceRef ? clip(opts.evidenceRef, 300) : null,
        status: accepted.has(ruleId) ? "accepted-risk" : "open",
      });
    }
  }

  return {
    format: "rubik-import-v1",
    scope: opts.scope,
    source: { kind: "audit", label: clip(`Lighthouse ${version} · ${formFactor} · ${opts.environment}`, 120), url: null, tool: clip(`lighthouse@${version}`, 80) },
    capturedAt: lhr.fetchTime ?? "",
    findings,
  };
}
