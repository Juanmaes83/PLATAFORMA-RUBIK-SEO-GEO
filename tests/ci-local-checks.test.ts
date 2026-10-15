import { describe, expect, it } from "vitest";
import {
  checkConfig,
  checkDependencies,
  checkForeignStacks,
  checkHosted,
  checkStackConsistency,
  checkStepResult,
  checkTestMarkers,
  checkVersions,
  destinationOf,
  guardStep,
  scanTestMarkers,
  stackOwnership,
  summarizeLog,
  verifyEvidence,
} from "../scripts/ci-local/checks.mjs";
import { envFileEntries, parseStatusEnv, readSupabaseConfig } from "../scripts/ci-local/facts.mjs";
import { parseArgs, runnerEnv, workflowPorts } from "../scripts/ci-local/run.mjs";

// N1-04 diagnostics. Pure functions over gathered facts: no Docker, Git or network here.
const codes = (findings: { code: string }[]) => findings.map((f) => f.code);
const cfg = { projectId: "plataforma-rubik-seo-geo", apiPort: 54321, dbPort: 54322, shadowPort: 54320 };
const HOSTED = ["https://", "abcdefghijklmnop", ".supabase.co"].join("");
const SHA = "a".repeat(40);

describe("1 · local dependencies", () => {
  it("requires git, npm, curl and a running Docker daemon", () => {
    const ok = { git: true, npm: true, curl: true, dockerClient: true, dockerDaemon: true, nodeModules: true, installMatchesLock: true };
    expect(checkDependencies({ tools: ok })).toEqual([]);
    expect(codes(checkDependencies({ tools: { ...ok, dockerDaemon: false } }))).toEqual(["DEP_DOCKER_DAEMON"]);
    expect(codes(checkDependencies({ tools: { ...ok, dockerClient: false } }))).toEqual(["DEP_DOCKER"]);
    expect(codes(checkDependencies({ tools: { ...ok, git: false, curl: false } }))).toEqual(["DEP_GIT", "DEP_CURL"]);
    expect(codes(checkDependencies({ tools: { ...ok, installMatchesLock: false } }))).toEqual(["DEP_STALE_INSTALL"]);
  });
});

describe("2 · versions", () => {
  const workflow = { jobs: { verify: { matrix: { node: ["22", "24"] } } } };
  const pins = { "ci.yml SUPABASE_CLI": "2.118.0", "package.json db:start": "2.118.0" };
  it("accepts a matrix Node and reports the legs that were not reproduced", () => {
    const f = checkVersions({ node: { version: "v22.22.0" }, engines: ">=22.12.0", nvmrc: "22", workflow, supabaseCliPins: pins });
    expect(codes(f)).toEqual(["VER_NODE_LEGS"]);
  });
  it("rejects Node outside the matrix or below engines", () => {
    expect(codes(checkVersions({ node: { version: "v20.18.0" }, engines: ">=22.12.0", workflow, supabaseCliPins: pins }))).toEqual(
      expect.arrayContaining(["VER_NODE_MATRIX", "VER_ENGINES"]),
    );
    expect(codes(checkVersions({ node: { version: "v22.11.0" }, engines: ">=22.12.0", workflow, supabaseCliPins: pins }))).toContain("VER_ENGINES");
  });
  it("rejects diverging Supabase CLI pins and flags a missing Playwright browser", () => {
    const f = checkVersions({ node: { version: "v24.1.0" }, engines: ">=22.12.0", workflow, supabaseCliPins: { ...pins, "package.json db:reset": "2.99.0" }, playwright: { expectedRevision: "1243", availableRevisions: ["1194"] } });
    expect(codes(f)).toEqual(expect.arrayContaining(["VER_SUPABASE_CLI", "VER_PLAYWRIGHT_BROWSER"]));
  });
});

describe("3 · accidental hosted Supabase", () => {
  it("classifies destinations without exposing them", () => {
    expect(destinationOf("http://127.0.0.1:54321")).toBe("local");
    expect(destinationOf("postgresql://u:p@localhost:54322/postgres")).toBe("local");
    expect(destinationOf(HOSTED)).toBe("hosted-supabase");
    expect(destinationOf("postgresql://u:p@aws-0-eu-west-1.pooler.supabase.com:6543/postgres")).toBe("hosted-supabase");
    expect(destinationOf("https://db.example.org")).toBe("remote");
    expect(destinationOf("")).toBe("empty");
  });
  it("refuses hosted URLs, hosted credentials and Vercel context in the environment", () => {
    const f = checkHosted({ env: { NEXT_PUBLIC_SUPABASE_URL: HOSTED, RUBIK_AUDIT_DATABASE_URL: "postgresql://w:p@db.example.org:5432/x", SUPABASE_ACCESS_TOKEN: "x".repeat(20), VERCEL_ENV: "preview", PGHOST: "db.example.org" } });
    expect(codes(f)).toEqual(expect.arrayContaining(["HOSTED_ENV", "HOSTED_CREDENTIAL", "HOSTED_VERCEL_ENV", "HOSTED_PGHOST"]));
    expect(codes(f).filter((c) => c === "HOSTED_ENV")).toHaveLength(2);
    // Messages name variables, never values.
    for (const x of f) expect(x.message).not.toContain("abcdefghijklmnop");
  });
  it("accepts the local stack in the environment", () => {
    expect(checkHosted({ env: { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" } })).toEqual([]);
  });
  it("detects .env files Next.js would load, a linked CLI and a linked Vercel project", () => {
    const entries = envFileEntries(`# c\nNEXT_PUBLIC_SUPABASE_URL="${HOSTED}"\nexport OPENSEO_API_KEY=\nX=1\n`);
    expect(entries).toEqual([
      { name: "NEXT_PUBLIC_SUPABASE_URL", destination: "hosted-supabase" },
      { name: "OPENSEO_API_KEY", destination: "empty" },
      { name: "X", destination: "not-a-url" },
    ]);
    const f = checkHosted({ env: {}, envFiles: [{ path: ".env.local", entries }, { path: ".env.test", entries: [{ name: "A", destination: "empty" }] }], supabaseLinked: true, vercelLinked: true });
    expect(codes(f)).toEqual(["HOSTED_ENV_FILE", "CONFIG_ENV_FILE", "HOSTED_CLI_LINK", "HOSTED_VERCEL_LINK"]);
  });
});

describe("4 · API and database of the local stack must match", () => {
  const container = { id: "c1", name: "supabase_db_plataforma-rubik-seo-geo", project: cfg.projectId, ports: [{ host: 54322, container: 5432 }] };
  it("accepts the stack described by config.toml", () => {
    expect(parseStatusEnv('API_URL="http://127.0.0.1:54321"\nDB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"\nSECRET_KEY="x"')).toEqual({
      API_URL: "http://127.0.0.1:54321", DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    });
    expect(checkStackConsistency({ config: cfg, status: { API_URL: "http://127.0.0.1:54321", DB_URL: "postgresql://p@127.0.0.1:54322/postgres" }, containers: [container] })).toEqual([]);
  });
  it("refuses another worktree's API, a mismatched DB, a hosted status and a container on another port", () => {
    expect(codes(checkStackConsistency({ config: cfg, status: { API_URL: "http://127.0.0.1:55321", DB_URL: "postgresql://p@127.0.0.1:54322/postgres" } }))).toEqual(["STACK_API_PORT"]);
    expect(codes(checkStackConsistency({ config: cfg, status: { API_URL: "http://127.0.0.1:54321", DB_URL: "postgresql://p@127.0.0.1:56322/postgres" } }))).toEqual(["STACK_DB_PORT"]);
    expect(codes(checkStackConsistency({ config: cfg, status: { API_URL: HOSTED, DB_URL: "postgresql://p@127.0.0.1:54322/postgres" } }))).toContain("STACK_NOT_LOCAL");
    expect(codes(checkStackConsistency({ config: cfg, status: { API_URL: "http://127.0.0.1:54321", DB_URL: "postgresql://p@127.0.0.1:54322/postgres" }, containers: [{ ...container, ports: [{ host: 55322, container: 5432 }] }] }))).toEqual(["STACK_CONTAINER_PORT"]);
    expect(codes(checkStackConsistency({ config: cfg, status: { API_URL: "nope" } }))).toEqual(["STACK_STATUS_UNPARSABLE"]);
  });
  it("detects a CI container name that does not belong to config.toml", () => {
    expect(codes(checkStackConsistency({ config: cfg, status: { API_URL: "http://127.0.0.1:54321", DB_URL: "postgresql://p@127.0.0.1:54322/x" }, ciContainerNames: ["supabase_db_otro"] }))).toEqual(["CONFIG_CI_CONTAINER"]);
  });
  it("reads only the needed values from config.toml", () => {
    expect(readSupabaseConfig('project_id = "p"\n[api]\nport = 1\n[db]\nport = 2 # c\nshadow_port = 3\n[db.pooler]\nport = 4\n[studio]\nport = 9\n')).toEqual({ projectId: "p", apiPort: 1, dbPort: 2, shadowPort: 3, poolerPort: 4 });
  });
});

describe("5 · containers that belong to another worktree", () => {
  const db = { id: "c1", name: "supabase_db_plataforma-rubik-seo-geo", project: cfg.projectId, ports: [{ host: 54322, container: 5432 }] };
  const kong = { id: "c2", name: "supabase_kong_plataforma-rubik-seo-geo", project: cfg.projectId, ports: [{ host: 54321, container: 8000 }] };
  const s1 = { id: "c9", name: "supabase_db_rubik-s1-writer-20261015", project: "rubik-s1-writer-20261015", ports: [{ host: 56322, container: 5432 }] };
  const ledger = { worktree: "/w", projectId: cfg.projectId, containerIds: ["c1", "c2"] };
  it("owns a stack only when every container is in this worktree's ledger", () => {
    expect(stackOwnership({ worktree: "/w", config: cfg, containers: [] }).state).toBe("absent");
    expect(stackOwnership({ worktree: "/w", config: cfg, containers: [db, kong], ledger }).state).toBe("owned");
    expect(stackOwnership({ worktree: "/w", config: cfg, containers: [db, kong] }).state).toBe("foreign");
    expect(stackOwnership({ worktree: "/other", config: cfg, containers: [db, kong], ledger }).state).toBe("foreign");
    expect(stackOwnership({ worktree: "/w", config: cfg, containers: [db, kong, { ...db, id: "c3" }], ledger }).state).toBe("foreign");
  });
  it("reports foreign stacks and port clashes, and preserves other projects", () => {
    expect(codes(checkForeignStacks({ worktree: "/w", config: cfg, containers: [db] }))).toEqual(["FOREIGN_SAME_PROJECT"]);
    expect(checkForeignStacks({ worktree: "/w", config: cfg, containers: [s1] })).toEqual([expect.objectContaining({ code: "FOREIGN_OTHER_PROJECT", level: "info" })]);
    expect(codes(checkForeignStacks({ worktree: "/w", config: cfg, containers: [{ ...s1, ports: [{ host: 54322, container: 5432 }] }] }))).toEqual(["FOREIGN_PORT_CLASH"]);
  });
});

describe("6 · incomplete configuration", () => {
  const good = {
    config: cfg,
    workflow: { env: { SUPABASE_CLI: "x", SUPABASE_EXCLUDE: "y", NEXT_TELEMETRY_DISABLED: "1" }, permissions: { contents: "read" }, triggers: ["pull_request"] },
    npmScriptsUsed: ["lint"],
    packageScripts: { lint: "eslint" },
    referencedFiles: [{ path: "supabase/fixtures/a.sql", exists: true }],
    counts: { migrations: 3, pgtap: 2 },
  };
  it("accepts a complete configuration", () => expect(checkConfig(good)).toEqual([]));
  it("reports every missing piece", () => {
    const f = checkConfig({
      ...good,
      config: {},
      workflow: { env: {}, permissions: { contents: "write" }, triggers: ["pull_request_target"] },
      npmScriptsUsed: ["lint", "verify:gone"],
      referencedFiles: [{ path: "supabase/fixtures/gone.sql", exists: false }],
      counts: { migrations: 0, pgtap: 0 },
    });
    expect(codes(f)).toEqual(expect.arrayContaining(["CONFIG_SUPABASE", "CONFIG_WORKFLOW_ENV", "CONFIG_NPM_SCRIPT", "CONFIG_REFERENCED_FILE", "CONFIG_MIGRATIONS", "CONFIG_PGTAP", "CONFIG_PERMISSIONS", "CONFIG_PR_TARGET"]));
    expect(codes(checkConfig({ ...good, workflow: { ...good.workflow, permissions: {} } }))).toEqual(["CONFIG_PERMISSIONS_DEFAULT"]);
  });
});

describe("7 · skipped tests never count as passed", () => {
  it("finds .only, skips, todo and fixme, and separates the e2e viewport dedupe", () => {
    const src = [
      'it.only("x", () => {});',
      '// it.skip("commented", () => {});',
      'describe.skip("y", () => {});',
      'it.todo("z");',
      'test.fixme("w", () => {});',
      'it.skipIf(process.env.CI)("v", () => {});',
      '  test.skip(info.project.name !== "escritorio-1280", "changes data: runs once");',
    ].join("\n");
    const markers = scanTestMarkers("t.ts", src);
    expect(markers.map((m) => m.kind)).toEqual(["only", ".skip", ".todo", ".fixme", ".skipIf", "viewport-dedupe"]);
    expect(codes(checkTestMarkers(markers))).toEqual(["SKIP_ONLY", "SKIP_MARKER", "SKIP_MARKER", "SKIP_MARKER", "SKIP_MARKER", "SKIP_VIEWPORT_DEDUPE"]);
  });
  it("reads test summaries and flags runtime skips and missing summaries", () => {
    expect(summarizeLog(" Test Files  43 passed (43)\n      Tests  401 passed | 2 skipped (403)\n")).toEqual({ vitest: { passed: 401, skipped: 2 } });
    expect(summarizeLog("  145 passed (3.2m)\n  44 skipped\n")).toEqual({ playwright: { passed: 145, skipped: 44, failed: 0, flaky: 0 } });
    expect(summarizeLog("Files=19, Tests=581,  2 wallclock secs\nResult: PASS\n")).toEqual({ pgtap: { result: "PASS", files: 19, tests: 581 } });
    expect(summarizeLog("src/a.ts(1,1): error TS2322: x\nsrc/b.ts(1,1): error TS2322: y")).toEqual({ typescript: { errors: 2 } });
    expect(summarizeLog("Failed to compile.")).toEqual({ build: { failed: true } });
    expect(codes(checkStepResult({ label: "e2e", status: "passed", expectsSummary: true, summary: { playwright: { passed: 145, skipped: 44, failed: 0, flaky: 1 } } }))).toEqual(["SKIP_RUNTIME", "SKIP_FLAKY"]);
    expect(codes(checkStepResult({ label: "unit", status: "passed", expectsSummary: true, summary: {} }))).toEqual(["SKIP_NO_SUMMARY"]);
    expect(codes(checkStepResult({ label: "x", status: "skipped", reason: "r" }))).toEqual(["STEP_NOT_RUN"]);
  });
});

describe("8 · build and type failures", () => {
  it("reports failed steps with their TypeScript and build causes", () => {
    const f = checkStepResult({ label: "Typecheck", status: "failed", exitCode: 2, summary: { typescript: { errors: 3 }, build: { failed: true } } });
    expect(codes(f)).toEqual(["STEP_FAILED", "BUILD_TYPES", "BUILD_FAILED"]);
  });
});

describe("9 · evidence bound to the right SHA", () => {
  const evidence = { kind: "local-ci-equivalent", head: SHA, dirty: [], ciYmlSha256: "c", lockSha256: "l", verdict: "PASS", steps: [{ status: "passed" }] };
  const current = { head: SHA, ciYmlSha256: "c", lockSha256: "l" };
  it("accepts evidence for the current commit and definitions", () => expect(verifyEvidence(evidence, current)).toEqual([]));
  it("refuses other commits, dirty trees, changed CI/lockfile, non-local kind and inconsistent verdicts", () => {
    expect(codes(verifyEvidence({ ...evidence, head: "b".repeat(40) }, current))).toEqual(["EVIDENCE_SHA_MISMATCH"]);
    expect(codes(verifyEvidence({ ...evidence, head: "abc" }, current))).toEqual(["EVIDENCE_NO_SHA"]);
    expect(codes(verifyEvidence({ ...evidence, dirty: [" M x"] }, current))).toEqual(["EVIDENCE_DIRTY"]);
    expect(codes(verifyEvidence(evidence, { ...current, ciYmlSha256: "c2" }))).toEqual(["EVIDENCE_DEFINITION_CHANGED"]);
    expect(codes(verifyEvidence({ ...evidence, lockSha256: undefined }, current))).toEqual(["EVIDENCE_INCOMPLETE"]);
    expect(codes(verifyEvidence({ ...evidence, kind: "github-actions" }, current))).toEqual(["EVIDENCE_KIND"]);
    expect(codes(verifyEvidence({ ...evidence, steps: [{ status: "skipped" }] }, current))).toEqual(["EVIDENCE_VERDICT"]);
    expect(codes(verifyEvidence(null, current))).toEqual(["EVIDENCE_MISSING"]);
  });
});

describe("10 · destructive operations need authorisation", () => {
  const start = { label: "start", ownedStack: ["start local stack"] };
  const drop = { label: "drop", ownedStack: ["DROP on the local database"] };
  const stop = { label: "stop", ownedStack: ["stop local stack"] };
  it("never runs forbidden commands", () => {
    expect(guardStep({ label: "p", forbidden: ["db push (hosted migrations)"] }, "owned")).toMatchObject({ allowed: false, finding: { code: "DESTRUCTIVE_FORBIDDEN" } });
  });
  it("starts only when no stack exists and mutates only an owned one", () => {
    expect(guardStep(start, "absent").allowed).toBe(true);
    expect(guardStep(start, "foreign")).toMatchObject({ allowed: false, finding: { code: "DESTRUCTIVE_NOT_OWNED" } });
    expect(guardStep(drop, "foreign")).toMatchObject({ allowed: false, finding: { code: "DESTRUCTIVE_NOT_OWNED" } });
    expect(guardStep(drop, "absent").allowed).toBe(false);
    expect(guardStep(drop, "owned").allowed).toBe(true);
    expect(guardStep(stop, "owned", { keepStack: true })).toMatchObject({ allowed: false, skip: true });
    expect(guardStep({ label: "lint" }, "foreign").allowed).toBe(true);
  });
});

describe("runner isolation", () => {
  it("passes a whitelist environment: no tokens, cloud keys or developer Supabase settings", () => {
    const env = runnerEnv(
      { PATH: "/bin", HOME: "/h", GH_TOKEN: "t", GITHUB_TOKEN: "t", AWS_SECRET_ACCESS_KEY: "k", NEXT_PUBLIC_SUPABASE_URL: HOSTED, OPENSEO_API_KEY: "k", HTTPS_PROXY: "http://p", EXTRA: "e" },
      { NEXT_TELEMETRY_DISABLED: "1" },
      ["EXTRA"],
    );
    expect(env).toEqual({ PATH: "/bin", HOME: "/h", HTTPS_PROXY: "http://p", EXTRA: "e", NEXT_TELEMETRY_DISABLED: "1", CI: "true" });
  });
  it("collects the host ports the workflow binds", () => {
    expect(workflowPorts([{ script: "npm start -- -p 3217 &\ncurl http://localhost:3218/x" }, { script: "npm run test:e2e" }])).toEqual([3217, 3218]);
  });
  it("parses options and refuses unknown ones or skips without a reason", () => {
    const o = parseArgs(["--job", "e2e", "--keep-stack", "--skip-step", "Install Chromium for Playwright=sin red"]);
    expect(o).toMatchObject({ job: "e2e", keepStack: true });
    expect(o.skip.get("Install Chromium for Playwright")).toBe("sin red");
    expect(() => parseArgs(["--skip-step", "x"])).toThrow();
    expect(() => parseArgs(["--job", "deploy"])).toThrow();
    expect(() => parseArgs(["--force"])).toThrow();
  });
});
