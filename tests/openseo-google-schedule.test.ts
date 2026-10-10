import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { validCaptureKey, type CaptureOutcome } from "@/lib/openseo/google/capture";
import { validQuery, type ManualGoogleQuery } from "@/lib/openseo/google/manual-report";
import { MAX_ATTEMPTS, applyOutcome, backoffMs, captureKey, plan, runTick, windowsDue, type CaptureSchedule, type RunRecord } from "@/lib/openseo/google/schedule";

// Periodic captures, simulated only: fake clock, fake capture with the same idempotency rule as
// migration 20261012120000 (a stored key returns its result without reading the provider again).
// Nothing here is wired to a route, a cron, a table or an environment.
const gsc: CaptureSchedule = { id: "7c9e6679-7425-40de-944b-e07fc1f90ae7", provider: "search-console", cadence: "weekly", state: "ACTIVE",
  query: { dimensions: ["page"], rowLimit: 25 }, maxCapturesPerMonth: 8, catchUp: 1 };
const at = (s: string) => new Date(`${s}T06:00:00Z`);

function google() {
  const stored = new Map<string, string>();
  const provider = vi.fn(async (): Promise<CaptureOutcome> => ({ ok: true, resultId: "", replayed: false, audited: true }));
  const capture = vi.fn(async (key: string, query: ManualGoogleQuery): Promise<CaptureOutcome> => {
    expect(validCaptureKey(key) && validQuery(query)).toBe(true);
    const done = stored.get(key);
    if (done) return { ok: true, resultId: done, replayed: true, audited: false };
    const r = await provider();
    if (!r.ok) return r;
    const id = `00000000-0000-4000-8000-${String(stored.size + 1).padStart(12, "0")}`;
    stored.set(key, id);
    return { ok: true, resultId: id, replayed: false, audited: true };
  });
  return { stored, provider, capture, isActive: vi.fn(async () => true) };
}

describe("windows", () => {
  it("weekly: full ISO weeks old enough for Google's lag, equal length and contiguous", () => {
    // Wednesday 14 Oct, GSC lag 3 days → last complete day Sunday 11 Oct.
    expect(windowsDue(gsc, at("2026-10-14"))).toEqual([{ start: "2026-09-28", end: "2026-10-04" }, { start: "2026-10-05", end: "2026-10-11" }]);
    // Tuesday 13 Oct → last complete day Saturday 10 Oct: the week of 5–11 is not closed yet.
    expect(windowsDue(gsc, at("2026-10-13")).at(-1)).toEqual({ start: "2026-09-28", end: "2026-10-04" });
    const ga4 = { ...gsc, provider: "google-analytics" as const, query: { limit: 25, offset: 0 } };
    expect(windowsDue(ga4, at("2026-10-13")).at(-1)).toEqual({ start: "2026-10-05", end: "2026-10-11" });
  });

  it("monthly: closed calendar months, valid as a manual capture (≤ 31 days)", () => {
    const m = { ...gsc, cadence: "monthly" as const, catchUp: 2 };
    expect(windowsDue(m, at("2026-10-03"))).toEqual([{ start: "2026-07-01", end: "2026-07-31" }, { start: "2026-08-01", end: "2026-08-31" }, { start: "2026-09-01", end: "2026-09-30" }]);
    expect(windowsDue({ ...m, catchUp: 0 }, at("2026-10-02"))).toEqual([{ start: "2026-08-01", end: "2026-08-31" }]);
    expect(windowsDue({ ...m, catchUp: 0 }, at("2026-03-05"))).toEqual([{ start: "2026-02-01", end: "2026-02-28" }]);
  });

  it("keys are deterministic, valid and distinct per schedule and window", () => {
    const [a, b] = windowsDue(gsc, at("2026-10-14"));
    expect(captureKey(gsc, a)).toBe("sched_gsc_7c9e6679742540de944be07fc1f90ae7_20260928_20261004");
    expect(validCaptureKey(captureKey(gsc, a))).toBe(true);
    expect(captureKey(gsc, a)).not.toBe(captureKey(gsc, b));
    expect(captureKey({ ...gsc, id: "8c9e6679-7425-40de-944b-e07fc1f90ae7" }, a)).not.toBe(captureKey(gsc, a));
  });
});

describe("ticks (simulated)", () => {
  it("captures one window per tick, then nothing once both are stored; a repeated tick reads Google zero times", async () => {
    const g = google();
    let t = await runTick(gsc, [], at("2026-10-14"), g);
    t = await runTick(gsc, t.runs, at("2026-10-14"), g);
    expect(t.runs.map((r) => r.state)).toEqual(["STORED", "STORED"]);
    const again = await runTick(gsc, t.runs, at("2026-10-14"), g);
    expect(again.started).toBe(0);
    expect(g.provider).toHaveBeenCalledTimes(2);
  });

  it("lost run records (crash after storing, or a second runner) replay by key without a new read", async () => {
    const g = google();
    await runTick(gsc, [], at("2026-10-14"), { ...g, maxPerTick: 2 });
    const replay = await runTick(gsc, [], at("2026-10-14"), { ...g, maxPerTick: 2 });
    expect(replay.runs.every((r) => r.state === "STORED")).toBe(true);
    expect(g.provider).toHaveBeenCalledTimes(2);
    expect(g.capture).toHaveBeenCalledTimes(4);
  });

  it("retryable failures back off exponentially and give up after MAX_ATTEMPTS", async () => {
    const g = google();
    g.provider.mockResolvedValue({ ok: false, error: "UNAVAILABLE" });
    const s = { ...gsc, catchUp: 0, maxCapturesPerMonth: 31 };
    let runs: RunRecord[] = [];
    let now = at("2026-10-14");
    for (let i = 1; i <= MAX_ATTEMPTS; i++) {
      runs = (await runTick(s, runs, now, g)).runs;
      if (i < MAX_ATTEMPTS) {
        expect(runs[0]).toMatchObject({ state: "RETRY", attempts: i });
        expect(Date.parse(runs[0].nextAttemptAt!) - now.getTime()).toBe(backoffMs(i));
        expect((await runTick(s, runs, new Date(now.getTime() + backoffMs(i) - 1), g)).started).toBe(0); // still waiting
        now = new Date(Date.parse(runs[0].nextAttemptAt!));
      }
    }
    expect(runs[0]).toMatchObject({ state: "GAVE_UP", attempts: MAX_ATTEMPTS, lastError: "UNAVAILABLE" });
    expect((await runTick(s, runs, new Date(now.getTime() + 86_400_000), g)).started).toBe(0);
    expect(g.provider).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    expect(backoffMs(1)).toBe(15 * 60_000);
    expect(backoffMs(20)).toBe(24 * 3_600_000);
  });

  it("a failure that needs a person blocks the whole schedule until it is resolved", async () => {
    for (const error of ["NOT_CONNECTED", "FORBIDDEN", "DISABLED", "SIGNING_NOT_CONFIGURED", "SOURCE_CHANGED"] as const) {
      const g = google();
      g.provider.mockResolvedValue({ ok: false, error });
      const t = await runTick(gsc, [], at("2026-10-14"), { ...g, maxPerTick: 2 });
      expect(t).toMatchObject({ started: 1, stoppedBy: "blocked" });
      expect(plan(gsc, t.runs, at("2026-10-21"))).toEqual({ state: "blocked", reason: error });
      expect((await runTick(gsc, t.runs, at("2026-10-21"), g)).started).toBe(0);
    }
  });

  it("paused or cancelled schedules never capture, also when cancelled during a tick", async () => {
    const g = google();
    for (const state of ["PAUSED", "CANCELLED"] as const) expect(await runTick({ ...gsc, state }, [], at("2026-10-14"), g)).toMatchObject({ started: 0, stoppedBy: "inactive" });
    g.isActive.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const t = await runTick(gsc, [], at("2026-10-14"), { ...g, maxPerTick: 2 });
    expect(t).toMatchObject({ started: 1, stoppedBy: "inactive" });
    expect(g.provider).toHaveBeenCalledTimes(1);
  });

  it("the monthly cap counts every attempt started this month, retries included", async () => {
    const s = { ...gsc, maxCapturesPerMonth: 1 };
    const failed = applyOutcome(undefined, { start: "2026-09-28", end: "2026-10-04" }, { ok: false, error: "UNAVAILABLE" }, at("2026-10-01"));
    const p = plan(s, [{ ...failed, nextAttemptAt: undefined }], at("2026-10-14"));
    expect(p.state === "active" && p.decisions.map((d) => d.action)).toEqual(["over-budget", "over-budget"]);
    // A new month frees the budget.
    const nov = plan(s, [{ ...failed, nextAttemptAt: undefined }], at("2026-11-04"));
    expect(nov.state === "active" && nov.decisions.filter((d) => d.action === "capture")).toHaveLength(1);
  });
});

describe("not activated", () => {
  it("no application code imports the planner (no route, action, cron or instrumentation uses it)", () => {
    const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]);
    const users = files("src").filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith("schedule.ts") && /google\/schedule/.test(readFileSync(f, "utf8")));
    expect(users).toEqual([]);
    expect(existsSync("vercel.json") && /crons/.test(readFileSync("vercel.json", "utf8"))).toBe(false);
  });
});
