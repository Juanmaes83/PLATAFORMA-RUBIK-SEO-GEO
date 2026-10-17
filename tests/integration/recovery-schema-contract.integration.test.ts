import { expect, it } from "vitest";
import { recoverySchemaContract } from "@/lib/recovery/schema-contract";

it("the complete Content/GEO catalog selects v4 even with the UI flag off", async () => {
  expect(await recoverySchemaContract({ RUBIK_N2_SCHEMA_AVAILABLE: "false",
    RUBIK_RECOVERY_SCHEMA_ATTESTATION: "pre-n2-through-20261015210000" })).toBe("n2-v4");
});
