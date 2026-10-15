import { afterEach, describe, expect, it, vi } from "vitest";
import { localDatabaseContainer, localSupabaseEnv } from "../scripts/supabase-test-env.mjs";

const shell = vi.hoisted(() => ({ execSync: vi.fn(), execFileSync: vi.fn() }));
vi.mock("node:child_process", () => shell);
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
const status = (apiPort: number, dbPort: number, host = "127.0.0.1") =>
  `API_URL="http://${host}:${apiPort}"\nDB_URL="postgresql://local@127.0.0.1:${dbPort}/postgres"\nPUBLISHABLE_KEY="local-placeholder"\nSECRET_KEY="local-placeholder"`;

describe("local test API / SQL destination binding (no database operations)", () => {
  it("defaults to the shared local stack and refuses a different local API", () => {
    vi.stubEnv("RUBIK_TEST_ISOLATED_STACK", "");
    shell.execSync.mockReturnValue(status(54321, 54322));
    expect(localSupabaseEnv().apiUrl).toBe("http://127.0.0.1:54321");
    shell.execSync.mockReturnValue(status(55321, 55322));
    expect(() => localSupabaseEnv()).toThrow("Refused");
  });
  it("requires the explicitly selected isolated API and DB pair", () => {
    vi.stubEnv("RUBIK_TEST_ISOLATED_STACK", "1");
    shell.execSync.mockReturnValue(status(55321, 55322));
    expect(localSupabaseEnv().apiUrl).toBe("http://127.0.0.1:55321");
    for (const pair of [[54321, 54322], [55321, 54322]]) {
      shell.execSync.mockReturnValue(status(pair[0], pair[1]));
      expect(() => localSupabaseEnv()).toThrow("Refused");
    }
  });
  it("refuses a hosted status response before any Docker call", () => {
    vi.stubEnv("RUBIK_TEST_ISOLATED_STACK", "1");
    shell.execSync.mockReturnValue(status(55321, 55322, "foreign.supabase.co"));
    expect(() => localDatabaseContainer()).toThrow("Refused");
    expect(shell.execFileSync).not.toHaveBeenCalled();
  });
  it("binds recovery SQL to the container publishing the isolated DB port", () => {
    vi.stubEnv("RUBIK_TEST_ISOLATED_STACK", "1");
    shell.execSync.mockReturnValue(status(55321, 55322));
    shell.execFileSync.mockReturnValue("0.0.0.0:55322\n[::]:55322\n");
    expect(localDatabaseContainer()).toBe("supabase_db_rubik-s2-consent-20261015");
    expect(shell.execFileSync).toHaveBeenCalledWith("docker", ["port", "supabase_db_rubik-s2-consent-20261015", "5432/tcp"], expect.anything());
  });
  it("rejects a shared or ambiguous Docker mapping even with the isolated API", () => {
    vi.stubEnv("RUBIK_TEST_ISOLATED_STACK", "1");
    shell.execSync.mockReturnValue(status(55321, 55322));
    for (const mapping of ["0.0.0.0:54322", "0.0.0.0:55322\n[::]:54322", ""]) {
      shell.execFileSync.mockReturnValue(mapping);
      expect(() => localDatabaseContainer()).toThrow("Docker database does not match");
    }
  });
});
