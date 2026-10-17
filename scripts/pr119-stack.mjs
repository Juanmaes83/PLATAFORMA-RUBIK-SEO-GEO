// Prepare an isolated Supabase workdir; this script never starts or stops a stack.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { STACKS } from "./test-stacks.mjs";

const root = resolve(import.meta.dirname, "..");
const target = resolve(root, "test-results", "pr119-stack");
if (!target.startsWith(resolve(root, "test-results") + sep)) throw new Error("Refused: stack outside worktree test-results");
const supabase = join(target, "supabase");
const ports = new Map([[54321,62321],[54322,62322],[54320,62320],[54329,62329],[54323,62323],[54324,62324],[54327,62327],[8083,8233]]);
for (const part of ["migrations", "tests", "fixtures", "templates", "rollbacks"]) {
  const destination = join(supabase, part);
  if (existsSync(destination)) rmSync(destination, { recursive: true });
  if (existsSync(join(root, "supabase", part))) cpSync(join(root, "supabase", part), destination, { recursive: true });
}
mkdirSync(supabase, { recursive: true });
const config = readFileSync(join(root, "supabase", "config.toml"), "utf8").replace(/\r\n/g, "\n")
  .replace(/^project_id\s*=.*$/m, `project_id = "${STACKS.pr119Integration.projectId}"`)
  .replace(/^(\s*[a-z_]*port\s*=\s*)(\d+)(.*)$/gm, (_, prefix, port, tail) => {
    const next = ports.get(Number(port));
    if (!next) throw new Error(`Unmapped Supabase port ${port}`);
    return `${prefix}${next}${tail}`;
  });
writeFileSync(join(supabase, "config.toml"), config);
if (existsSync(join(root, "supabase", "seed.sql"))) cpSync(join(root, "supabase", "seed.sql"), join(supabase, "seed.sql"));
console.log(target);
