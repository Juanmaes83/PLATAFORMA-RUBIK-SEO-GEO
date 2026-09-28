import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { corePin, parseCorePin } from "@/lib/core/pin";
import { platform } from "@/lib/core";

const require = createRequire(import.meta.url);
const root = join(__dirname, "..");

describe("RUBIK-SEO-GEO-CORE dependency (ADR 0001)", () => {
  it("is pinned to a full 40-hex commit over HTTPS", () => {
    expect(corePin.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(corePin.repository).toBe("Juanmaes83/RUBIK-SEO-GEO-CORE");
    for (const bad of [
      "git+https://github.com/Juanmaes83/RUBIK-SEO-GEO-CORE.git#main",
      "git+https://github.com/Juanmaes83/RUBIK-SEO-GEO-CORE.git#20e4f4e",
      "github:Juanmaes83/RUBIK-SEO-GEO-CORE#20e4f4e1be3e8cc95c06589f60cb3ea591a3608a",
      "git+https://github.com/someone-else/RUBIK-SEO-GEO-CORE.git#20e4f4e1be3e8cc95c06589f60cb3ea591a3608a",
      "^0.1.0",
      undefined,
    ]) {
      expect(() => parseCorePin(bad), String(bad)).toThrow(/full commit SHA/);
    }
  });

  it("the lockfile resolves exactly the pinned commit", () => {
    const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
    const entry = lock.packages["node_modules/@rubik/seo-geo-core"];
    expect(entry.resolved.endsWith(`#${corePin.commit}`)).toBe(true);
  });

  it("the Core is loaded from node_modules, not from a copy in this repo", () => {
    const resolved = require.resolve("@rubik/seo-geo-core/platform-contracts");
    expect(resolved.split(sep).join("/")).toContain("node_modules/@rubik/seo-geo-core/src/");
    const copies: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/^rubik-seo-geo-.*\.(c?js|mjs)$/.test(name)) copies.push(path);
      }
    };
    walk(join(root, "src"));
    expect(copies).toEqual([]);
  });

  it("exposes the Core platform contracts used by the app", () => {
    expect(platform.ROLES).toContain("owner");
    expect(typeof platform.authorize).toBe("function");
    expect(platform.CONNECTORS.every((c) => c.status !== "CONNECTED")).toBe(true);
  });
});
