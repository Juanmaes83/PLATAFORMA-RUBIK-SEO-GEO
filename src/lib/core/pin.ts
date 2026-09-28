import pkg from "../../../package.json";

const CORE_PACKAGE = "@rubik/seo-geo-core";
const PIN = /^git\+https:\/\/github\.com\/Juanmaes83\/RUBIK-SEO-GEO-CORE\.git#([0-9a-f]{40})$/;

export interface CorePin {
  package: string;
  repository: string;
  commit: string;
  shortCommit: string;
}

/** Parses the Core dependency spec. Anything but a full 40-hex commit pin is an error. */
export function parseCorePin(spec: string | undefined): CorePin {
  const match = PIN.exec(spec ?? "");
  if (!match) {
    throw new Error(`${CORE_PACKAGE} must be pinned to a full commit SHA (got "${spec}")`);
  }
  return {
    package: CORE_PACKAGE,
    repository: "Juanmaes83/RUBIK-SEO-GEO-CORE",
    commit: match[1],
    shortCommit: match[1].slice(0, 7),
  };
}

export const corePin: CorePin = parseCorePin(
  (pkg.dependencies as Record<string, string>)[CORE_PACKAGE],
);
