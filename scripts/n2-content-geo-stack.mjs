// Create the exclusive Supabase CLI workdir for the N2-12/N2-13 integration (Contenidos + GEO).
// It refuses to replace an existing target, and does not start, stop or reset any container.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { STACKS } from "./test-stacks.mjs";

const root = resolve(import.meta.dirname, "..");
const destination = process.argv[2] === "--destination";
if (process.argv[2] && !destination) throw new Error("Usage: node scripts/n2-content-geo-stack.mjs [--destination]");
const target = resolve(root, "test-results", destination ? "n2-v4-destination" : "n2-final-stack");
if (!target.startsWith(resolve(root, "test-results") + sep) || existsSync(target))
  throw new Error("Refused: the N2 Contenidos/GEO stack workdir already exists or is outside test-results");
const supabase = join(target, "supabase");
mkdirSync(supabase, { recursive: true });
for (const part of ["migrations", "tests", "fixtures", "templates", "rollbacks"])
  if (existsSync(join(root, "supabase", part))) cpSync(join(root, "supabase", part), join(supabase, part), { recursive: true });
const ports = destination
  ? new Map([[54321, 53321], [54322, 53322], [54320, 53320], [54329, 53329], [54323, 53323], [54324, 53324], [54327, 53327], [8083, 8334]])
  : new Map([[54321, 52321], [54322, 52322], [54320, 52320], [54329, 52329], [54323, 52323], [54324, 52324], [54327, 52327], [8083, 8234]]);
const config = readFileSync(join(root, "supabase", "config.toml"), "utf8").replace(/\r\n/g, "\n")
  .replace(/^project_id\s*=.*$/m, `project_id = "${destination ? "rubik-n2-v4-destination-20261017" : STACKS.n2ContentGeo.projectId}"`)
  .replace(/^(\s*[a-z_]*port\s*=\s*)(\d+)(.*)$/gm, (_line, prefix, port, tail) => {
    const next = ports.get(Number(port));
    if (!next) throw new Error(`Refused: unmapped Supabase port ${port}`);
    return `${prefix}${next}${tail}`;
  });
writeFileSync(join(supabase, "config.toml"), config);
if (existsSync(join(root, "supabase", "seed.sql"))) cpSync(join(root, "supabase", "seed.sql"), join(supabase, "seed.sql"));
console.log(target);
