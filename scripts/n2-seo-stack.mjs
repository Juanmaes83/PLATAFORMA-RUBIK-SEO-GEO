// Prepare a disposable, isolated local Supabase config for N2-09.
// CLI: npx --yes supabase@2.118.0 --workdir test-results/n2-seo-stack start -x ...
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { STACKS } from "./test-stacks.mjs";

const root = resolve(import.meta.dirname, "..");
const target = resolve(root, "test-results", "n2-seo-stack");
if (!target.startsWith(resolve(root, "test-results") + sep)) throw new Error("Refused: N2 stack outside worktree test-results");
const supabase = join(target, "supabase");
const ports = new Map([[54321,59321],[54322,59322],[54320,59320],[54329,59329],[54323,59323],[54324,59324],[54327,59327],[8083,8113]]);
for (const part of ["migrations", "tests", "fixtures", "templates", "rollbacks"]) {
  const destination = join(supabase, part);
  if (existsSync(destination)) rmSync(destination, { recursive: true });
  if (existsSync(join(root, "supabase", part))) cpSync(join(root, "supabase", part), destination, { recursive: true });
}
mkdirSync(supabase, { recursive: true });
const config = readFileSync(join(root, "supabase", "config.toml"), "utf8").replace(/\r\n/g, "\n")
  .replace(/^project_id\s*=.*$/m, `project_id = "${STACKS.n2.projectId}"`)
  .replace(/^(\s*[a-z_]*port\s*=\s*)(\d+)(.*)$/gm, (_, prefix, port, tail) => {
    const next = ports.get(Number(port));
    if (!next) throw new Error(`Unmapped Supabase port ${port}`);
    return `${prefix}${next}${tail}`;
  });
writeFileSync(join(supabase, "config.toml"), config);
if (existsSync(join(root, "supabase", "seed.sql"))) cpSync(join(root, "supabase", "seed.sql"), join(supabase, "seed.sql"));
console.log(target);
