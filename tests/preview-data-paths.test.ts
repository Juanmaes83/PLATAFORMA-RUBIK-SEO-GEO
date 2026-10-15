import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// N1-04 · Architectural guard for the Preview lock. The lock lives in supabasePublicConfig()
// (src/lib/auth/mode.ts): it only protects data if EVERY path to a database goes through it.
// Any module that can open a database connection or a Supabase client must therefore call
// supabasePublicConfig() or previewLocked(). A new data path (for example a direct Postgres
// pool for a trusted writer) fails here until it is gated explicitly for Preview and reviewed.
const root = join(__dirname, "..");
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const rel = (f: string) => relative(root, f).replace(/\\/g, "/");
const sources = walk(join(root, "src")).filter((f) => /\.(ts|tsx|js|mjs)$/.test(f));
// Comments are removed so a mention in prose is neither a data path nor a gate.
const code = (f: string) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

// Value imports that can reach a database. `import type` is not a data path.
const DATA_PATH = [
  /import\s+(?!type\b)[^;]*\bfrom\s+["']@supabase\/ssr["']/,
  /import\s+(?!type\b)\{[^}]*\b(createClient)\b[^}]*\}\s+from\s+["']@supabase\/supabase-js["']/,
  /from\s+["'](pg|postgres|@neondatabase\/serverless|@vercel\/postgres|mysql2(\/promise)?|pg-pool)["']/,
  /(require|import)\(\s*["'](pg|postgres|@neondatabase\/serverless|@vercel\/postgres|mysql2(\/promise)?|pg-pool|@supabase\/ssr|@supabase\/supabase-js)["']\s*\)/,
];
const GATE = /\b(supabasePublicConfig|previewLocked)\s*\(/;

const dataPathModules = sources.filter((f) => DATA_PATH.some((re) => re.test(code(f))));

describe("every database path is behind the Preview lock", () => {
  it("finds the known Supabase entry points (the scan is not blind)", () => {
    const found = dataPathModules.map(rel);
    expect(found).toEqual(expect.arrayContaining(["src/lib/supabase/server.ts", "src/lib/supabase/proxy.ts"]));
  });

  it("each module that can open a database connection calls supabasePublicConfig() or previewLocked()", () => {
    const ungated = dataPathModules.filter((f) => !GATE.test(code(f))).map(rel);
    expect(ungated, "Gate these data paths for Preview (VERCEL_ENV=preview) before merging").toEqual([]);
  });

  it("the detector recognises direct Postgres pools and dynamic imports", () => {
    const samples = [
      'import { Pool } from "pg";',
      'import postgres from "postgres";',
      'const { Pool } = await import("pg");',
      'import { createClient } from "@supabase/supabase-js";',
      'import { createBrowserClient } from "@supabase/ssr";',
    ];
    for (const s of samples) expect(DATA_PATH.some((re) => re.test(s)), s).toBe(true);
    for (const s of ['import type { SupabaseClient } from "@supabase/supabase-js";', 'import type { EmailOtpType } from "@supabase/supabase-js";']) {
      expect(DATA_PATH.some((re) => re.test(s)), s).toBe(false);
    }
  });
});

describe("the public Supabase settings have a single reader", () => {
  it("only src/lib/auth/mode.ts reads NEXT_PUBLIC_SUPABASE_* from the environment", () => {
    const readers = sources.filter((f) => /\b(process\.)?env(\.|\[\s*["'])NEXT_PUBLIC_SUPABASE_/.test(code(f))).map(rel);
    expect(readers).toEqual(["src/lib/auth/mode.ts"]);
  });

  it("browser components never import a Supabase client or the server helpers", () => {
    for (const f of sources) {
      const text = code(f);
      if (!/^\s*["']use client["']/m.test(text)) continue;
      expect(text, rel(f)).not.toMatch(/from\s+["'](@supabase\/(ssr|supabase-js)|@\/lib\/supabase\/[^"']+|pg|postgres)["']/);
    }
  });

  it("no database credential can be exposed to the browser through NEXT_PUBLIC_* or next.config env", () => {
    for (const f of sources) {
      expect(code(f), rel(f)).not.toMatch(/NEXT_PUBLIC_[A-Z_]*(DATABASE|DB_URL|SERVICE_ROLE|SECRET|SIGNING|PASSWORD)/);
    }
    expect(readFileSync(join(root, "next.config.ts"), "utf8")).not.toMatch(/^\s*env\s*:/m);
  });
});
