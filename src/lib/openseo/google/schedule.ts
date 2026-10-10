// Periodic Google captures: DESIGN ONLY, not wired to any route, cron, table or environment.
// Nothing imports this module outside its tests (tests/openseo-google-schedule.test.ts), and
// activating it needs separate decisions (docs/CAPTURAS-PERIODICAS.md): a server identity for
// runs without a user session, a schedule table with RLS, quota/budget approval and a cron host.
//
// The planner is pure and deterministic: it receives the schedule, the runs already recorded and
// the clock, and returns what to do. Safety comes from the existing manual capture (ADR 0022):
//   - each window has a deterministic idempotency key, so a repeated tick, a crash after storing
//     or two overlapping runners replay the stored result instead of reading Google again;
//   - windows are full, closed periods of equal length (ISO weeks) old enough for Google's lag,
//     so two consecutive captures are comparable without warnings;
//   - retryable failures back off exponentially up to a fixed number of attempts; a failure that
//     needs a person (revoked binding, disabled reads, missing keyring) blocks the schedule;
//   - a paused or cancelled schedule never captures, also when cancelled in the middle of a tick;
//   - a monthly cap bounds how many captures a schedule may start.
import type { CaptureError, CaptureOutcome } from "./capture";
import type { ManualGoogleQuery } from "./manual-report";

export type ScheduleProvider = "search-console" | "google-analytics";
export interface CaptureSchedule {
  id: string;
  provider: ScheduleProvider;
  cadence: "weekly" | "monthly";
  state: "ACTIVE" | "PAUSED" | "CANCELLED";
  /** Bounded like a manual capture; the period is set by the planner. */
  query: { dimensions: string[]; rowLimit: number } | { limit: number; offset: number };
  /** Captures this schedule may START per calendar month (UTC), retries included. */
  maxCapturesPerMonth: number;
  /** Missed closed windows recovered besides the latest one (0 = only the latest). */
  catchUp: number;
}
export interface CaptureWindow { start: string; end: string }
export interface RunRecord {
  window: CaptureWindow;
  state: "STORED" | "RETRY" | "GAVE_UP" | "BLOCKED";
  attempts: number;
  lastError?: CaptureError;
  resultId?: string;
  nextAttemptAt?: string;
  startedAt: string[]; // ISO timestamps of each attempt (budget is counted from these)
}
export type Decision =
  | { action: "capture"; window: CaptureWindow; key: string; query: ManualGoogleQuery }
  | { action: "done" | "gave-up"; window: CaptureWindow }
  | { action: "wait"; window: CaptureWindow; until: string }
  | { action: "over-budget"; window: CaptureWindow };
export type Plan = { state: "inactive" | "blocked"; reason: string } | { state: "active"; decisions: Decision[] };

/** Days Google needs before a period is reasonably complete (conservative; GSC shows ~2–3 days). */
export const LAG_DAYS: Record<ScheduleProvider, number> = { "search-console": 3, "google-analytics": 2 };
export const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 15 * 60_000;
const MAX_BACKOFF_MS = 24 * 3_600_000;
const RETRYABLE = new Set<CaptureError>(["IN_PROGRESS", "UNAVAILABLE", "STORE_FAILED", "PROVIDER_STATUS"]);
const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** Closed windows whose last day is at least LAG_DAYS old, oldest first (latest + catchUp). */
export function windowsDue(s: CaptureSchedule, now: Date): CaptureWindow[] {
  const lastComplete = utcDay(now) - LAG_DAYS[s.provider] * DAY;
  const out: CaptureWindow[] = [];
  if (s.cadence === "weekly") {
    // Last ISO week (Monday–Sunday) ending on or before lastComplete.
    const dow = (new Date(lastComplete).getUTCDay() + 6) % 7; // Monday = 0
    let end = dow === 6 ? lastComplete : lastComplete - (dow + 1) * DAY;
    for (let i = 0; i <= s.catchUp; i++, end -= 7 * DAY) out.unshift({ start: iso(end - 6 * DAY), end: iso(end) });
  } else {
    const d = new Date(lastComplete + DAY); // a month is complete if the day after lastComplete starts a new month or later
    let y = d.getUTCFullYear(), m = d.getUTCMonth();
    for (let i = 0; i <= s.catchUp; i++) {
      m -= 1; if (m < 0) { m = 11; y -= 1; }
      out.unshift({ start: iso(Date.UTC(y, m, 1)), end: iso(Date.UTC(y, m + 1, 0)) });
    }
  }
  return out;
}

/** Deterministic idempotency key for one schedule window (valid for validCaptureKey). */
export function captureKey(s: CaptureSchedule, w: CaptureWindow): string {
  return `sched_${s.provider === "search-console" ? "gsc" : "ga4"}_${s.id.replace(/-/g, "").toLowerCase()}_${w.start.replace(/-/g, "")}_${w.end.replace(/-/g, "")}`;
}

export function queryFor(s: CaptureSchedule, w: CaptureWindow): ManualGoogleQuery {
  return s.provider === "search-console"
    ? { provider: "search-console", startDate: w.start, endDate: w.end, ...(s.query as { dimensions: string[]; rowLimit: number }) }
    : { provider: "google-analytics", startDate: w.start, endDate: w.end, ...(s.query as { limit: number; offset: number }) };
}

export function backoffMs(attempt: number): number {
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1));
}

const sameWindow = (a: CaptureWindow, b: CaptureWindow) => a.start === b.start && a.end === b.end;
const monthOf = (t: string) => t.slice(0, 7);

export function plan(s: CaptureSchedule, runs: RunRecord[], now: Date): Plan {
  if (s.state !== "ACTIVE") return { state: "inactive", reason: s.state };
  const blocked = runs.find((r) => r.state === "BLOCKED");
  if (blocked) return { state: "blocked", reason: blocked.lastError ?? "BLOCKED" };
  const month = monthOf(now.toISOString());
  let started = runs.reduce((n, r) => n + r.startedAt.filter((t) => monthOf(t) === month).length, 0);
  const decisions = windowsDue(s, now).map((window): Decision => {
    const run = runs.find((r) => sameWindow(r.window, window));
    if (run?.state === "STORED") return { action: "done", window };
    if (run?.state === "GAVE_UP") return { action: "gave-up", window };
    if (run?.nextAttemptAt && Date.parse(run.nextAttemptAt) > now.getTime()) return { action: "wait", window, until: run.nextAttemptAt };
    if (started >= s.maxCapturesPerMonth) return { action: "over-budget", window };
    started += 1;
    return { action: "capture", window, key: captureKey(s, window), query: queryFor(s, window) };
  });
  return { state: "active", decisions };
}

/** New run record after one attempt. */
export function applyOutcome(previous: RunRecord | undefined, window: CaptureWindow, outcome: CaptureOutcome, now: Date): RunRecord {
  const attempts = (previous?.attempts ?? 0) + 1;
  const startedAt = [...(previous?.startedAt ?? []), now.toISOString()];
  if (outcome.ok) return { window, state: "STORED", attempts, resultId: outcome.resultId, startedAt };
  if (!RETRYABLE.has(outcome.error)) return { window, state: "BLOCKED", attempts, lastError: outcome.error, startedAt };
  if (attempts >= MAX_ATTEMPTS) return { window, state: "GAVE_UP", attempts, lastError: outcome.error, startedAt };
  return { window, state: "RETRY", attempts, lastError: outcome.error, startedAt, nextAttemptAt: new Date(now.getTime() + backoffMs(attempts)).toISOString() };
}

/**
 * One scheduler tick for one schedule, with injected effects (simulated in tests). At most
 * `maxPerTick` captures start; `isActive` is re-read before each one so a cancellation during the
 * tick stops the next capture. A blocking failure stops the tick.
 */
export async function runTick(s: CaptureSchedule, runs: RunRecord[], now: Date, deps: {
  capture: (key: string, query: ManualGoogleQuery) => Promise<CaptureOutcome>;
  isActive: () => Promise<boolean>;
  maxPerTick?: number;
}): Promise<{ runs: RunRecord[]; started: number; stoppedBy?: "inactive" | "blocked" }> {
  const p = plan(s, runs, now);
  if (p.state !== "active") return { runs, started: 0, stoppedBy: p.state };
  let next = [...runs], started = 0;
  for (const d of p.decisions) {
    if (d.action !== "capture" || started >= (deps.maxPerTick ?? 1)) continue;
    if (!(await deps.isActive())) return { runs: next, started, stoppedBy: "inactive" };
    started += 1;
    const outcome = await deps.capture(d.key, d.query);
    const prev = next.find((r) => sameWindow(r.window, d.window));
    const rec = applyOutcome(prev, d.window, outcome, now);
    next = [...next.filter((r) => r !== prev), rec];
    if (rec.state === "BLOCKED") return { runs: next, started, stoppedBy: "blocked" };
  }
  return { runs: next, started };
}
