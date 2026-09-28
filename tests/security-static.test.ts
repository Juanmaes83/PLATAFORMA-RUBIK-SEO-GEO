import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Static guarantees about the source and the migrations. They complement the pgTAP suite
// (supabase/tests) and the integration/e2e tests, which exercise the running stack.
const root = join(__dirname, "..");
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const sources = walk(join(root, "src")).filter((f) => /\.(ts|tsx)$/.test(f));
const read = (f: string) => readFileSync(f, "utf8");
const rel = (f: string) => relative(root, f).replace(/\\/g, "/");
const migrations = readdirSync(join(root, "supabase", "migrations")).filter((f) => f.endsWith(".sql")).map((f) => read(join(root, "supabase", "migrations", f))).join("\n");

describe("creation errors never confirm that an identifier exists", () => {
  it("a failed insert maps to one generic code, whatever the database error was", () => {
    const actions = read(join(root, "src", "lib", "tenancy-actions.ts"));
    expect(actions).not.toMatch(/23505|identificador-ocupado|error\.code/);
    expect(actions.match(/if \(error\) redirect\("\/organizaciones\?error=no-creado"\);/g)).toHaveLength(2);
  });

  it("no tenancy message says an identifier is taken", async () => {
    const { TENANCY_ERRORS } = await import("@/lib/auth/messages");
    expect(Object.keys(TENANCY_ERRORS)).not.toContain("identificador-ocupado");
    expect(TENANCY_ERRORS["no-creado"]).toBe("No se ha podido crear. Revisa los datos o prueba con otro identificador.");
    for (const text of Object.values(TENANCY_ERRORS)) expect(text).not.toMatch(/en uso|existe|ocupad|ya hay/i);
  });
});

describe("no fictitious access path remains", () => {
  it("the demo fixtures and demo cookie are gone", () => {
    expect(existsSync(join(root, "src", "lib", "fixtures"))).toBe(false);
    for (const f of sources) expect(read(f), rel(f)).not.toMatch(/rubik_demo_session|DEMO_USERS|findDemoUser|signInAsDemoUser/);
  });

  it("authorization never reads user or app metadata", () => {
    for (const f of sources) expect(read(f), rel(f)).not.toMatch(/user_metadata|app_metadata|raw_user_meta_data/);
    const policies = migrations.match(/create policy[\s\S]*?;/gi) ?? [];
    for (const p of policies) expect(p).not.toMatch(/metadata/i);
  });

  it("the application never uses a secret or service_role key", () => {
    for (const f of sources) {
      if (["src/lib/auth/mode.ts", "src/instrumentation.ts"].includes(rel(f))) continue; // only detect and refuse such keys
      expect(read(f), rel(f)).not.toMatch(/service_role|SERVICE_ROLE|SECRET_KEY|sb_secret_/);
    }
    for (const f of sources.filter((f) => /^\s*["']use client["']/.test(read(f)))) {
      expect(read(f), rel(f)).not.toMatch(/supabase|process\.env/);
    }
  });

  it("every protected page verifies the session on the server", () => {
    const pages = [
      "src/app/panel/page.tsx",
      "src/app/proyectos/page.tsx",
      "src/app/organizaciones/page.tsx",
      "src/app/proyectos/[tenantId]/[projectId]/page.tsx",
      "src/app/proyectos/[tenantId]/[projectId]/[seccion]/page.tsx",
      "src/components/WorkspaceUnavailable.tsx",
    ];
    for (const p of pages) expect(read(join(root, p)), p).toMatch(/requireSession\(\)/);
    for (const p of ["revision", "borradores", "equipo", "configuracion"]) {
      expect(read(join(root, "src", "app", p, "page.tsx")), p).toMatch(/WorkspaceUnavailable/);
    }
    expect(read(join(root, "src", "lib", "tenancy-actions.ts"))).toMatch(/currentUser\(\)/);
  });
});

describe("migrations: RLS and least privilege", () => {
  const tables = [...migrations.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]);

  it("every public table enables RLS and has policies only for authenticated", () => {
    expect(tables.length).toBeGreaterThanOrEqual(4);
    for (const t of tables) {
      expect(migrations, t).toMatch(new RegExp(`alter table public\\.${t} enable row level security`));
      expect(migrations, t).toMatch(new RegExp(`create policy "[^"]+" on public\\.${t}`));
    }
    const policies = migrations.match(/create policy[\s\S]*?;/gi) ?? [];
    for (const p of policies) expect(p).toMatch(/\bto authenticated\b/);
  });

  it("every UPDATE policy has both USING and WITH CHECK", () => {
    const updates = (migrations.match(/create policy[\s\S]*?;/gi) ?? []).filter((p) => /for update/i.test(p));
    expect(updates.length).toBeGreaterThan(0);
    for (const p of updates) {
      expect(p).toMatch(/\busing\b/i);
      expect(p).toMatch(/\bwith check\b/i);
    }
  });

  it("grants nothing to anon and revokes defaults explicitly", () => {
    expect(migrations).not.toMatch(/grant [^;]* to [^;]*\banon\b/i);
    expect(migrations).toMatch(/revoke all on public\.organizations, public\.organization_members, public\.projects, public\.project_members\s+from public, anon, authenticated;/);
  });

  it("SECURITY DEFINER functions live outside exposed schemas with an empty search_path", () => {
    const definers = [...migrations.matchAll(/create function ([\w.]+)\([\s\S]*?security definer([^\n]*)/g)];
    expect(definers.length).toBeGreaterThan(0);
    for (const [, name, rest] of definers) {
      expect(name, name).toMatch(/^private\./);
      expect(rest, name).toMatch(/set search_path = ''/);
    }
  });
});
