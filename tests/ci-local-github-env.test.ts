import { describe, expect, it } from "vitest";
import { parseGithubEnv, redactWorkflowOutput } from "../scripts/ci-local/github-env.mjs";

const password = "a".repeat(36);
const localUrl = "postgresql://rubik_audit_writer:" + password + "@127.0.0.1:54322/postgres";

describe("S1 local CI: GitHub Actions environment exchange", () => {
  it("accepts only the fake writer for the local ephemeral PostgreSQL job", () => {
    expect(parseGithubEnv("")).toEqual({});
    expect(parseGithubEnv("RUBIK_AUDIT_DATABASE_URL=" + localUrl + "\n"))
      .toEqual({ RUBIK_AUDIT_DATABASE_URL: localUrl });
  });

  it("fails closed for hosted endpoints, privileged roles and arbitrary env", () => {
    for (const value of [
      "RUBIK_AUDIT_DATABASE_URL=postgresql://rubik_audit_writer:" + password + "@project.supabase.co:5432/postgres",
      "RUBIK_AUDIT_DATABASE_URL=postgresql://postgres:" + password + "@127.0.0.1:54322/postgres",
      "RUBIK_AUDIT_DATABASE_URL=postgresql://rubik_audit_writer:" + password + "@127.0.0.1:57322/postgres",
      "RUBIK_AUDIT_DATABASE_URL=postgresql://rubik_audit_writer:" + password + "@127.0.0.1:54322/postgres?sslmode=disable",
      "RUBIK_AUDIT_DATABASE_URL=not-a-url",
      "PATH=/malicious",
      "GITHUB_TOKEN=sensitive",
      "RUBIK_AUDIT_DATABASE_URL=" + localUrl + "\nSOMETHING_ELSE=evil",
      "RUBIK_AUDIT_DATABASE_URL=" + localUrl + "\nRUBIK_AUDIT_DATABASE_URL=" + localUrl,
      "BAD LINE WITHOUT EQUALS",
    ]) expect(() => parseGithubEnv(value)).toThrow();
  });

  it("suppresses ::add-mask:: output and masks secrets in later CI steps", () => {
    const masks: string[] = [];
    const first = redactWorkflowOutput("start\n::add-mask::" + password + "\nmask echoed " + password + "\n", masks);
    expect(first).not.toContain(password);
    expect(first).not.toContain("::add-mask");
    expect(masks).toContain(password);
    const next = redactWorkflowOutput("A password " + password + "; URL " + localUrl + "\n", masks);
    expect(next).not.toContain(password);
    expect(next).not.toContain(localUrl);
    expect(next).toContain("***");
  });

  it("redacts a local writer URL even without an announced mask", () => {
    expect(redactWorkflowOutput("oops " + localUrl + "\n")).toBe("oops ***\n");
  });
});
