import { expect, it } from "vitest";
import { recoverySchemaContract } from "@/lib/recovery/schema-contract";

it("the isolated N2 database, queried through the audit writer, requires v3 even with its UI flag off", async () => {
  expect(await recoverySchemaContract({ RUBIK_N2_SCHEMA_AVAILABLE: "false",
    RUBIK_RECOVERY_SCHEMA_ATTESTATION: "pre-n2-through-20261015210000" })).toBe("n2-v3");
});
