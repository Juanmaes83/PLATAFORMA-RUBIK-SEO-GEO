import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classifyScript, npmScriptsUsed, parseWorkflow, planJob } from "../scripts/ci-local/workflow.mjs";

// N1-04: the local procedure reproduces ci.yml step by step. These tests run on the real
// workflow file, so any change to CI that the local runner cannot reproduce fails here first.
const ciYml = readFileSync(join(__dirname, "..", ".github", "workflows", "ci.yml"), "utf8");
const workflow = parseWorkflow(ciYml);

describe("local CI equivalence: the real ci.yml", () => {
  it("is fully understood: every step of every job maps to a local action", () => {
    expect(Object.keys(workflow.jobs)).toEqual(["verify", "e2e"]);
    for (const job of Object.values(workflow.jobs)) {
      const plan = planJob(job);
      expect(plan.length, job.id).toBe(job.steps.length);
      expect(plan.every((s) => ["run", "checkout", "setup-node", "upload-artifact"].includes(s.kind)), job.id).toBe(true);
    }
    expect(workflow.jobs.verify.matrix.node).toEqual(["22", "24"]);
  });

  it("keeps the security contract: read-only token, no pull_request_target, no secrets, no hosted command", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.triggers).toEqual(["push", "pull_request"]);
    expect(ciYml).not.toMatch(/pull_request_target|secrets\.|db push|--linked|--project-ref|vercel /);
    for (const job of Object.values(workflow.jobs)) {
      for (const step of planJob(job)) expect(step.forbidden ?? [], step.label).toEqual([]);
    }
  });

  it("only stack-touching steps need ownership, and the destructive ones are among them", () => {
    const e2e = planJob(workflow.jobs.e2e);
    const owned = e2e.filter((s) => s.ownedStack?.length).map((s) => s.label);
    expect(owned).toContain("Start the local Supabase stack (migrations applied, no seed data)");
    expect(owned).toContain("Hosted-like automatic-RLS state (Studio template) is fixed by the migration");
    expect(owned).toContain("Stop the local stack");
    expect(planJob(workflow.jobs.verify).some((s) => s.ownedStack?.length)).toBe(false);
  });

  it("references only npm scripts that exist", () => {
    const scripts = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8")).scripts;
    const used = Object.values(workflow.jobs).flatMap((j) => j.steps.flatMap((s) => npmScriptsUsed(s.run ?? "")));
    expect(used.length).toBeGreaterThan(5);
    for (const name of used) expect(scripts[name], name).toBeTruthy();
  });

  it("keeps the Preview, mock and secret-key barriers as CI steps", () => {
    const labels = planJob(workflow.jobs.verify).map((s) => s.label);
    expect(labels.some((l) => /Forbidden configurations/.test(l))).toBe(true);
    expect(labels.some((l) => /Production smoke/.test(l))).toBe(true);
    const preview = planJob(workflow.jobs.verify).find((s) => /Preview lock smoke/.test(s.label));
    expect(preview?.script).toMatch(/VERCEL_ENV=preview PREVIEW_SUPABASE_ISOLATED=true/);
    expect(preview?.script).toMatch(/s\.auth!=='preview-locked'/);
    // The server must be the one this step started, and must be stopped on every exit path.
    expect(preview?.script).toMatch(/already in use/);
    expect(preview?.script).toMatch(/trap 'kill -- -\$server/);
  });
});

describe("workflow parser is strict", () => {
  const base = "name: ci\non:\n  pull_request:\npermissions:\n  contents: read\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n";
  it("rejects unknown actions instead of skipping them", () => {
    const wf = parseWorkflow(`${base}      - uses: someone/deploy@v1\n`);
    expect(() => planJob(wf.jobs.a)).toThrow(/not mapped/);
  });
  it("rejects conditions and step env it cannot reproduce", () => {
    expect(() => planJob(parseWorkflow(`${base}      - name: x\n        if: github.event_name == 'push'\n        run: echo\n`).jobs.a)).toThrow(/condition/);
    expect(() => planJob(parseWorkflow(`${base}      - name: x\n        env:\n          A: b\n        run: echo\n`).jobs.a)).toThrow(/step-level env/);
  });
  it("rejects unknown keys and job features it does not reproduce", () => {
    expect(() => parseWorkflow(`${base}      - name: x\n        shell: pwsh\n        run: echo\n`)).toThrow(/unknown step key/);
    expect(() => parseWorkflow(`${base.replace("    steps:\n", "    services:\n      pg: x\n    steps:\n")}      - run: echo\n`)).toThrow(/unknown job key/);
  });
  it("keeps block scalars byte-for-byte (minus indentation)", () => {
    const wf = parseWorkflow(`${base}      - name: multi\n        run: |\n          set +e\n          echo "a  b"\n\n          echo c\n`);
    expect(wf.jobs.a.steps[0].run).toBe('set +e\necho "a  b"\n\necho c\n');
  });
});

describe("command classification", () => {
  it("forbids hosted and deploy commands whatever the context", () => {
    for (const cmd of ["npx supabase@2.118.0 db push", "$SUPABASE_CLI link --project-ref abc", "supabase db reset --linked", "vercel env pull", "vercel deploy --prod", "echo ${{ secrets.X }}", "psql --db-url x"]) {
      expect(classifyScript(cmd).forbidden.length, cmd).toBeGreaterThan(0);
    }
  });
  it("marks local stack mutations as owned-stack-only", () => {
    for (const cmd of ["$SUPABASE_CLI start -x a", "$SUPABASE_CLI stop --no-backup", "npx supabase db reset", "docker exec -i db psql", "drop event trigger ensure_rls;", "npm run test:e2e"]) {
      expect(classifyScript(cmd).ownedStack.length, cmd).toBeGreaterThan(0);
    }
    expect(classifyScript("npm run lint").ownedStack).toEqual([]);
  });
});
