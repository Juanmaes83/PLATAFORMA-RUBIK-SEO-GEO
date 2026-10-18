import { describe, expect, it } from "vitest";
import { PREVIEW_PROVIDER_LOCK, readOpenSeoConfig, readOpenSeoMcpConfig } from "@/lib/openseo/config";

// U02: Preview never calls OpenSEO or Google through OpenSEO, even with an approved isolated
// database and inherited provider variables. Production/local parsing is unchanged.
const configured = {
  OPENSEO_ENDPOINT: "https://openseo.ejemplo.test", OPENSEO_API_KEY: ["oseo", "x".repeat(16)].join("_"), OPENSEO_PROJECT_ID: "p1",
  NEXT_PUBLIC_SUPABASE_URL: "https://rhnnplewqsekrnaousyl.supabase.co",
};

describe("providers in Vercel Preview", () => {
  it("are off whatever the inherited variables say", () => {
    for (const VERCEL_ENV of ["preview", " preview "]) {
      expect(readOpenSeoConfig({ ...configured, VERCEL_ENV })).toEqual({ state: "invalid", problems: [PREVIEW_PROVIDER_LOCK] });
      expect(readOpenSeoMcpConfig({ ...configured, VERCEL_ENV })).toEqual({ state: "not-configured" });
    }
  });
  it("keep their normal configuration outside Preview", () => {
    for (const VERCEL_ENV of ["production", undefined]) {
      expect(readOpenSeoConfig({ ...configured, VERCEL_ENV }).state).toBe("configured");
      expect(readOpenSeoMcpConfig({ ...configured, VERCEL_ENV }).state).toBe("configured");
    }
  });
});
