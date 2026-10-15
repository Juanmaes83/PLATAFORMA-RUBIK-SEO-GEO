import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { rewriteConfig } from "../scripts/claude-s1-stack.mjs";
import { STACKS } from "../scripts/test-stacks.mjs";

// Claude's S1 stack must not share a single published port or project id with any other stack.
describe("Claude S1 local stack configuration", () => {
  const original = readFileSync(join(__dirname, "..", "supabase", "config.toml"), "utf8");
  const rewritten = rewriteConfig(original);
  const ports = (text: string) => [...text.matchAll(/^\s*[a-z_]*port\s*=\s*(\d+)/gm)].map((m) => Number(m[1]));

  it("moves every published port and the project id", () => {
    expect(rewritten).toMatch(/^project_id = "rubik-claude-s1-20261015"$/m);
    const before = ports(original);
    const after = ports(rewritten);
    expect(after).toHaveLength(before.length);
    for (const p of after) expect(before).not.toContain(p);
    expect(after).toEqual(expect.arrayContaining([STACKS.claudeS1.apiPort, STACKS.claudeS1.dbPort]));
  });

  it("uses ports no other registered stack uses", () => {
    const others = Object.values(STACKS).filter((s) => s !== STACKS.claudeS1).flatMap((s) => [s.apiPort, s.dbPort]);
    for (const p of ports(rewritten)) expect(others).not.toContain(p);
  });

  it("refuses unknown ports instead of keeping them", () => {
    expect(() => rewriteConfig('project_id = "x"\n[api]\nport = 1234\n')).toThrow("unmapped port 1234");
    expect(() => rewriteConfig("[api]\nport = 54321\n")).toThrow("project_id missing");
  });
});
