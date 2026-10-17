import { expect, it } from "vitest";
import { recoverySchemaContract } from "@/lib/recovery/schema-contract";

// The verifier selects the stack and, for the Contenidos/GEO stack only, first checks that its six
// tables exist (scripts/verify-n2-integration.mjs). The UI flags never decide the contract.
const contentGeoStack = process.env.RUBIK_TEST_N2_CONTENT_GEO_STACK === "1";

it(`the isolated N2 database, queried through the audit writer, requires ${contentGeoStack ? "v4" : "v3"} even with its UI flags off`, async () => {
  expect(await recoverySchemaContract({ RUBIK_N2_SCHEMA_AVAILABLE: "false", RUBIK_N2_CONTENT_GEO_SCHEMA_AVAILABLE: "false",
    RUBIK_RECOVERY_SCHEMA_ATTESTATION: "pre-n2-through-20261015210000" })).toBe(contentGeoStack ? "n2-v4" : "n2-v3");
});
