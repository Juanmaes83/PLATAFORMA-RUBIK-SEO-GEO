// Module hooks so a local Node script can run the app's TypeScript modules without Next.js or a
// bundler: Node strips the types; these hooks resolve the `@/` alias and extensionless imports,
// turn `server-only` into an empty module and expose JSON files as ES modules. Used only by
// local owner tools (scripts/verify-export.mjs); the app itself never loads this file.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = new URL("../../src/", import.meta.url);
const EMPTY = "data:text/javascript,export%20%7B%7D%3B";

function tsCandidate(base) {
  const path = fileURLToPath(base);
  if (/\.(ts|tsx|json)$/.test(path)) return existsSync(path) ? pathToFileURL(path).href : null;
  for (const suffix of [".ts", ".tsx", "/index.ts"]) {
    if (existsSync(path + suffix)) return pathToFileURL(path + suffix).href;
  }
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: EMPTY, shortCircuit: true };
  if (specifier.startsWith("@/")) {
    const url = tsCandidate(new URL(specifier.slice(2), SRC));
    if (url) return { url, shortCircuit: true };
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    const url = tsCandidate(new URL(specifier, context.parentURL));
    if (url) return { url, shortCircuit: true };
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url.startsWith("file:") && url.endsWith(".json")) {
    const { readFile } = await import("node:fs/promises");
    const json = await readFile(fileURLToPath(url), "utf8");
    return { format: "module", source: `export default ${json};`, shortCircuit: true };
  }
  if (url.startsWith("file:") && url.endsWith(".ts")) return next(url, { ...context, format: "module-typescript" });
  return next(url, context);
}
