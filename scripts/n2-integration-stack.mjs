// Prepare a disposable, isolated Supabase CLI workdir for the combined N2 integration stack.
// This only writes config/migration copies beneath test-results; it never starts, stops or resets Docker.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { STACKS } from "./test-stacks.mjs";

const root = resolve(import.meta.dirname, "..");
const target = resolve(root, "test-results", "n2-integration-stack");
if (!target.startsWith(resolve(root, "test-results") + sep)) throw new Error("Refused: N2 integration stack outside worktree test-results");
const supabase = join(target, "supabase");
const ports = new Map([[54321,60321],[54322,60322],[54320,60320],[54329,60329],[54323,60323],[54324,60324],[54327,60327],[8083,8213]]);
for (const part of ["migrations", "tests", "fixtures", "templates", "rollbacks"]) {
  const destination = join(supabase, part);
  if (existsSync(destination)) rmSync(destination, { recursive: true });
  if (existsSync(join(root, "supabase", part))) cpSync(join(root, "supabase", part), destination, { recursive: true });
}
mkdirSync(supabase, { recursive: true });
const config = readFileSync(join(root, "supabase", "config.toml"), "utf8").replace(/\r\n/g, "\n")
  .replace(/^project_id\s*=.*$/m, `project_id = "${STACKS.n2Integration.projectId}"`)
  .replace(/^(\s*[a-z_]*port\s*=\s*)(\d+)(.*)$/gm, (_, prefix, port, tail) => {
    const next = ports.get(Number(port));
    if (!next) throw new Error(`Unmapped Supabase port ${port}`);
    return `${prefix}${next}${tail}`;
  });
writeFileSync(join(supabase, "config.toml"), config);
if (existsSync(join(root, "supabase", "seed.sql"))) cpSync(join(root, "supabase", "seed.sql"), join(supabase, "seed.sql"));
console.log(target);
