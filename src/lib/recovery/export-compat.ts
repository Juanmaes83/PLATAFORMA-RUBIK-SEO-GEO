import type { ProjectExport } from "@/lib/provenance/repository";

/**
 * Preserve the pre-N2 project export contract when N2 storage is explicitly unavailable.
 * It deliberately has no manifest: offline verification reports UNPROVEN and restore refuses it.
 */
export function buildExportWithoutN2(exported: ProjectExport, operations: unknown) {
  const state = operations && typeof operations === "object" ? operations as Record<string, unknown> : {};
  const notIncluded = Array.isArray(state.notIncluded) ? state.notIncluded.filter((value): value is string => typeof value === "string") : [];
  return { ...exported, format: "rubik-project-export-v2" as const,
    operations: { ...state, notIncluded: [...notIncluded, "seo-and-competitors: N2 schema disabled; existing N2 rows, if any, were not read" ] } };
}
