import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { loadCredentialKeyring, type CredentialBinding } from "@/lib/credentials/crypto";

// ADR 0010: per-client credential encryption, with throwaway keys generated at run time.
const key = () => randomBytes(32).toString("base64");
const binding: CredentialBinding = {
  credentialId: "00000000-0000-4000-8000-0000000000c1",
  organizationId: "00000000-0000-4000-8000-0000000000a1",
  projectId: "00000000-0000-4000-8000-0000000000b1",
  provider: "search-console",
};
const SECRET = ["refresh", randomBytes(12).toString("hex")].join("-");
const ring = (env: Record<string, string>) => {
  const loaded = loadCredentialKeyring(env);
  if (!loaded.ok) throw new Error(loaded.error);
  return loaded.keyring;
};

describe("per-client credential encryption (ADR 0010)", () => {
  it("seals and opens only with the same binding; stored form carries no plaintext", () => {
    const k = ring({ CREDENTIALS_ENCRYPTION_KEYS: `k1:${key()}`, CREDENTIALS_ACTIVE_KEY_ID: "k1" });
    const sealed = k.seal(SECRET, binding);
    expect(Object.keys(sealed).sort()).toEqual(["ciphertext", "iv", "keyId", "tag", "v"]);
    expect(JSON.stringify(sealed)).not.toContain(SECRET);
    expect(k.open(sealed, binding)).toBe(SECRET);
    for (const field of ["credentialId", "organizationId", "projectId"] as const) {
      expect(k.open(sealed, { ...binding, [field]: "00000000-0000-4000-8000-0000000000ff" }), field).toBeNull();
    }
    expect(k.open(sealed, { ...binding, provider: "bing-webmaster" })).toBeNull();
  });

  it("detects tampering and never throws with the secret in the message", () => {
    const k = ring({ CREDENTIALS_ENCRYPTION_KEYS: `k1:${key()}`, CREDENTIALS_ACTIVE_KEY_ID: "k1" });
    const sealed = k.seal(SECRET, binding);
    const flip = (b64: string) => { const b = Buffer.from(b64, "base64"); b[0] ^= 1; return b.toString("base64"); };
    for (const bad of [{ ...sealed, ciphertext: flip(sealed.ciphertext) }, { ...sealed, tag: flip(sealed.tag) }, { ...sealed, iv: flip(sealed.iv) },
      { ...sealed, keyId: "k2" }, { ...sealed, v: 2 }, null, "texto", { ...sealed, iv: "!!" }]) {
      expect(k.open(bad, binding)).toBeNull();
    }
    expect(() => k.seal("", binding)).toThrow("invalid credential or binding");
    expect(() => k.seal(SECRET, { ...binding, projectId: "no" })).toThrow("invalid credential or binding");
  });

  it("each seal uses a fresh nonce", () => {
    const k = ring({ CREDENTIALS_ENCRYPTION_KEYS: `k1:${key()}`, CREDENTIALS_ACTIVE_KEY_ID: "k1" });
    const a = k.seal(SECRET, binding);
    const b = k.seal(SECRET, binding);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("rotates: old values open with the retired key, reseal moves them to the active key", () => {
    const k1 = key();
    const k2 = key();
    const old = ring({ CREDENTIALS_ENCRYPTION_KEYS: `k1:${k1}`, CREDENTIALS_ACTIVE_KEY_ID: "k1" }).seal(SECRET, binding);
    const rotated = ring({ CREDENTIALS_ENCRYPTION_KEYS: `k1:${k1},k2:${k2}`, CREDENTIALS_ACTIVE_KEY_ID: "k2" });
    expect(rotated.open(old, binding)).toBe(SECRET);
    const moved = rotated.reseal(old, binding);
    expect(moved?.keyId).toBe("k2");
    expect(rotated.open(moved, binding)).toBe(SECRET);
    // Once k1 is removed, only resealed values remain readable.
    const after = ring({ CREDENTIALS_ENCRYPTION_KEYS: `k2:${k2}`, CREDENTIALS_ACTIVE_KEY_ID: "k2" });
    expect(after.open(old, binding)).toBeNull();
    expect(after.open(moved, binding)).toBe(SECRET);
  });

  it("refuses incomplete or unsafe configuration without echoing values", () => {
    const k = key();
    const cases: [Record<string, string>, string][] = [
      [{}, "CREDENTIAL_KEYS_NOT_CONFIGURED"],
      [{ CREDENTIALS_ENCRYPTION_KEYS: `k1:${k}`, CREDENTIALS_ACTIVE_KEY_ID: "k1", NEXT_PUBLIC_CREDENTIALS_ENCRYPTION_KEYS: `k1:${k}` }, "CREDENTIAL_KEYS_PUBLIC"],
      [{ CREDENTIALS_ENCRYPTION_KEYS: `k1:${k}` }, "CREDENTIAL_KEYS_NOT_CONFIGURED"],
      [{ CREDENTIALS_ENCRYPTION_KEYS: "sin-separador", CREDENTIALS_ACTIVE_KEY_ID: "k1" }, "CREDENTIAL_KEYS_MALFORMED"],
      [{ CREDENTIALS_ENCRYPTION_KEYS: `k1:${randomBytes(16).toString("base64")}`, CREDENTIALS_ACTIVE_KEY_ID: "k1" }, "CREDENTIAL_KEY_SIZE"],
      [{ CREDENTIALS_ENCRYPTION_KEYS: `k1:${k},k1:${key()}`, CREDENTIALS_ACTIVE_KEY_ID: "k1" }, "CREDENTIAL_KEY_DUPLICATE"],
      [{ CREDENTIALS_ENCRYPTION_KEYS: `k1:${k}`, CREDENTIALS_ACTIVE_KEY_ID: "k9" }, "CREDENTIAL_ACTIVE_KEY_MISSING"],
    ];
    for (const [env, error] of cases) {
      const loaded = loadCredentialKeyring(env);
      expect(loaded).toEqual({ ok: false, error });
      expect(JSON.stringify(loaded)).not.toContain(k);
    }
  });
});
