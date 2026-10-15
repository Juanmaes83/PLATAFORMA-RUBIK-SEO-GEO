// N2-12 analysis over what the project actually holds. Nothing is measured here: the module
// labels how strong the support for a proposal is, points at POSSIBLE overlaps (never a
// confirmed cannibalisation: there are no ranking data), derives the internal links a cluster
// implies, and checks whether a brief is ready for review.

import type { ClusterRole, EvidenceKind, OpportunityStatus, OpportunityType, Priority } from "./contract";

export interface OpportunityView {
  id: string;
  topic: string;
  pageUrl: string | null;
  pageKind: "existing" | "proposed";
  opportunityType: OpportunityType;
  priority: Priority;
  status: OpportunityStatus;
  clusterId: string | null;
  clusterRole: ClusterRole | null;
  marketLanguage: string;
  marketCountry: string | null;
}

/**
 * How a priority is supported. "observed": at least one stored provider result; "declared":
 * an import or a consulted source; "hypothesis": only the analyst's reasoning, or nothing.
 */
export type Support = "observed" | "declared" | "hypothesis";
export function supportOf(kinds: readonly EvidenceKind[]): Support {
  if (kinds.includes("provider-result")) return "observed";
  if (kinds.includes("import-finding") || kinds.includes("manual-source")) return "declared";
  return "hypothesis";
}
export const SUPPORT_LABEL: Record<Support, string> = {
  observed: "Con dato observado",
  declared: "Con fuente declarada",
  hypothesis: "Basada en hipótesis",
};

const STOPWORDS = new Set(("de la el los las y en del al un una unos unas para por con sin que qué como cómo cuál cuáles " +
  "es son a o u e su sus mi mis tu tus lo le les se the of and for to in on with a an how what is").split(/\s+/));
/** Lowercase, accent-free content words. */
export function tokens(s: string): Set<string> {
  return new Set(s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w)));
}
export function similarity(a: string, b: string): number {
  const x = tokens(a), y = tokens(b);
  if (x.size === 0 || y.size === 0) return 0;
  let inter = 0;
  for (const w of x) if (y.has(w)) inter++;
  return inter / (x.size + y.size - inter);
}

export const OVERLAP_THRESHOLD = 0.6;
export type OverlapReason = "same-page" | "similar-topic";
export interface Overlap { a: OpportunityView; b: OpportunityView; reason: OverlapReason; score: number }
export const OVERLAP_LABEL: Record<OverlapReason, string> = {
  "same-page": "Posible solapamiento: apuntan a la misma página",
  "similar-topic": "Posible solapamiento: temas muy parecidos",
};

const normUrl = (u: string) => u.trim().toLowerCase().replace(/[#?].*$/, "").replace(/\/+$/, "").replace(/^https?:\/\/(www\.)?/, "");

/** Possible overlaps among active opportunities of the same market. Never "confirmed". */
export function possibleOverlaps(list: readonly OpportunityView[]): Overlap[] {
  const active = list.filter((o) => o.status !== "discarded");
  const out: Overlap[] = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i], b = active[j];
      if (a.marketLanguage !== b.marketLanguage || (a.marketCountry ?? "") !== (b.marketCountry ?? "")) continue;
      if (a.pageUrl && b.pageUrl && normUrl(a.pageUrl) === normUrl(b.pageUrl)) {
        // Consolidating several pages into one is the point of a "consolidate" opportunity.
        if (a.opportunityType !== "consolidate" && b.opportunityType !== "consolidate") out.push({ a, b, reason: "same-page", score: 1 });
        continue;
      }
      const score = similarity(a.topic, b.topic);
      if (score >= OVERLAP_THRESHOLD) out.push({ a, b, reason: "similar-topic", score });
    }
  }
  return out;
}

export interface ProposedLink { from: OpportunityView; to: OpportunityView }
/** A cluster implies: every support page links to each pillar, and each pillar back to its supports. */
export function clusterLinks(members: readonly OpportunityView[]): ProposedLink[] {
  const active = members.filter((o) => o.status !== "discarded");
  const pillars = active.filter((o) => o.clusterRole === "pillar");
  const supports = active.filter((o) => o.clusterRole === "support");
  const links: ProposedLink[] = [];
  for (const p of pillars) for (const s of supports) links.push({ from: s, to: p }, { from: p, to: s });
  return links;
}

export interface BriefReadiness { ready: boolean; missing: string[] }
/** What the database requires before review, plus what an editor will need (warnings). */
export function briefReadiness(b: { objective: string | null; audience: string | null; outline: readonly { level: number }[]; questions: readonly string[] }, evidenceCount: number): BriefReadiness {
  const missing: string[] = [];
  if (!b.objective?.trim()) missing.push("Objetivo");
  if (!b.audience?.trim()) missing.push("Audiencia");
  if (b.outline.length === 0) missing.push("Estructura de encabezados");
  const ready = missing.length === 0;
  if (!b.outline.some((i) => i.level === 1)) missing.push("Un H1 (recomendado)");
  if (b.questions.length === 0) missing.push("Preguntas que debe responder (recomendado)");
  if (evidenceCount === 0) missing.push("Alguna evidencia en la oportunidad (recomendado)");
  return { ready, missing };
}
