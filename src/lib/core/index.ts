import "server-only";

// Single entry point to RUBIK-SEO-GEO-CORE. The Core is installed from its Git repository
// pinned to a commit (see package.json and docs/adr/0001) and marked as a server external
// package, so this app runs the exact Core code at that commit: nothing is copied here.
import platform from "@rubik/seo-geo-core/platform-contracts";
import { corePin } from "./pin";

export { platform, corePin };

export type {
  Actor,
  Approval,
  Connector,
  Decision,
  Role,
  Scope,
} from "@rubik/seo-geo-core/platform-contracts";
