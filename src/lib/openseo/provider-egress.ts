import "server-only";
import { headers } from "next/headers";

const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type ProviderDestination = "openseo" | "google-via-openseo";

/** Correlation only: a caller cannot use this header to authorize an action. */
export async function requestProviderRunId(): Promise<string | null> {
  try {
    const candidate = (await headers()).get("x-rubik-u03-run-id")?.trim() ?? "";
    return RUN_ID.test(candidate) ? candidate.toLowerCase() : null;
  } catch {
    // Unit calls and non-request contexts have no correlation header; they remain unaudited.
    return null;
  }
}

export function recordProviderGate(runId: string | null, destination: ProviderDestination, outcome: "blocked") {
  if (process.env.VERCEL_ENV !== "preview" || !runId || !RUN_ID.test(runId)) return;
  console.info(JSON.stringify({ event: "u03-provider-egress", runId, destination, phase: "gate", outcome, outbound: false }));
}

export function recordProviderInvocation(runId: string | undefined, destination: ProviderDestination) {
  if (process.env.VERCEL_ENV !== "preview" || !runId || !RUN_ID.test(runId)) return;
  console.info(JSON.stringify({ event: "u03-provider-egress", runId, destination, phase: "transport", outcome: "attempt", outbound: true }));
}
