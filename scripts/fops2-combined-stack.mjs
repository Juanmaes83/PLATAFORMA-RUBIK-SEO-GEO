// Prepare an isolated local Supabase workdir for the F-OPS-2 + #120 gate.
// Never starts or resets another agent's stack.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { STACKS } from "./test-stacks.mjs";

const root = resolve(import.meta.dirname, "..");
const target = resolve(root, "test-results", "fops2-combined-stack");
if (!target.startsWith(resolve(root, "test-results") + sep) || existsSync(target))
  throw new Error("Refused: isolated F-OPS-2 stack already exists or is outside test-results");
const supabase = join(target, "supabase");
mkdirSync(supabase, { recursive: true });
for (const part of ["migrations", "tests", "fixtures", "templates", "rollbacks"])
  if (existsSync(join(root, "supabase", part))) cpSync(join(root, "supabase", part), join(supabase, part), { recursive: true });
const ports = new Map([[54321, 63321], [54322, 63322], [54320, 63320], [54329, 63329], [54323, 63323], [54324, 63324], [54327, 63327], [8083, 8333]]);
const config = readFileSync(join(root, "supabase", "config.toml"), "utf8").replace(/\r\n/g, "\n")
  .replace(/^project_id\s*=.*$/m, `project_id = "${STACKS.fops2Combined.projectId}"`)
  .replace(/^(\s*[a-z_]*port\s*=\s*)(\d+)(.*)$/gm, (_line, prefix, port, tail) => {
    const next = ports.get(Number(port));
    if (!next) throw new Error(`Refused: unmapped Supabase port ${port}`);
    return `${prefix}${next}${tail}`;
  });
writeFileSync(join(supabase, "config.toml"), config);
if (existsSync(join(root, "supabase", "seed.sql"))) cpSync(join(root, "supabase", "seed.sql"), join(supabase, "seed.sql"));
console.log(target);
