import { expect, it } from "vitest";
import { recoverySchemaContract } from "@/lib/recovery/schema-contract";

it("the combined Content/GEO schema refuses a falsely complete v3 export", async () => {
  expect(await recoverySchemaContract({ RUBIK_N2_SCHEMA_AVAILABLE: "false",
    RUBIK_RECOVERY_SCHEMA_ATTESTATION: "pre-n2-through-20261015210000" })).toBe("unknown");
});
