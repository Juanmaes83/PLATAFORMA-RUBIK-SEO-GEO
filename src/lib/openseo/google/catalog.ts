// What the hosted OpenSEO instance must expose before Search Console or GA4 is called "available".
// Pure check over a `tools/list` answer (which runs no tool and costs nothing). The expectations
// come from the reference code open-seo@0ffff93; the hosted instance may differ, which is exactly
// what this check is for. A tool missing, not read-only or with a different required input is a
// blocker, never a warning.
import { GOOGLE_READ_TOOLS, type ListedTool } from "@/lib/openseo/mcp-client";

export type GoogleTool = (typeof GOOGLE_READ_TOOLS)[number];

/** Required input fields per tool in the reference code. Extra optional fields are fine. */
export const EXPECTED_REQUIRED: Readonly<Record<GoogleTool, readonly string[]>> = {
  get_search_console_performance: ["projectId"],
  inspect_urls: ["projectId", "urls"],
  get_google_analytics_organic_overview: ["projectId"],
  get_google_analytics_organic_landing_pages: ["projectId"],
  get_google_analytics_page_performance: ["projectId"],
  get_google_analytics_key_events: ["projectId"],
  get_google_analytics_traffic_acquisition: ["projectId"],
  get_google_analytics_ecommerce_performance: ["projectId"],
  get_google_analytics_site_search: ["projectId"],
  get_google_analytics_audience_breakdown: ["projectId"],
  get_google_analytics_measurement_health: ["projectId"],
  get_search_opportunities: ["projectId"],
};

export type ToolCheck =
  | { tool: GoogleTool; state: "ok" }
  | { tool: GoogleTool; state: "missing" | "not-read-only" | "input-changed"; detail?: string };

const requiredOf = (schema: unknown): string[] | null => {
  const required = (schema as { required?: unknown })?.required;
  return Array.isArray(required) && required.every((r) => typeof r === "string") ? [...required].sort() : null;
};

export function checkGoogleCatalog(listed: readonly ListedTool[]): { searchConsole: boolean; analytics: boolean; checks: ToolCheck[] } {
  const byName = new Map(listed.map((t) => [t.name, t]));
  const checks = GOOGLE_READ_TOOLS.map((tool): ToolCheck => {
    const found = byName.get(tool);
    if (!found) return { tool, state: "missing" };
    if (found.annotations?.readOnlyHint !== true || found.annotations?.destructiveHint === true) return { tool, state: "not-read-only" };
    const required = requiredOf(found.inputSchema);
    const expected = [...EXPECTED_REQUIRED[tool]].sort();
    if (!required || JSON.stringify(required) !== JSON.stringify(expected)) return { tool, state: "input-changed", detail: required ? required.join(", ") : "sin esquema" };
    return { tool, state: "ok" };
  });
  const ok = (names: readonly string[]) => names.every((n) => checks.find((c) => c.tool === n)?.state === "ok");
  return {
    searchConsole: ok(["get_search_console_performance", "inspect_urls"]),
    analytics: ok(GOOGLE_READ_TOOLS.filter((t) => t.startsWith("get_google_analytics_"))),
    checks,
  };
}
