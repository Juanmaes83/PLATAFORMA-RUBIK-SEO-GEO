import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Digest, ProvenanceSigner } from "@/lib/core";

// Server-side cryptography for CORE-9.2 (ADR 0004). The keys live only in the server
// environment (later a managed secret store/KMS chosen by the owner): never in the database,
// the repository, logs, error messages or the browser. Only key identifiers are stored.

/** SHA-256 digest injected into the Core (signProvenance/verifyProvenance, auditEvent). */
export const sha256: Digest = Object.freeze({
  alg: "sha256",
  hash: (text: string) => createHash("sha256").update(text, "utf8").digest("hex"),
});

const KEY_ID = /^[a-z0-9][a-z0-9-]{1,62}$/;
const MIN_KEY_BYTES = 32;

export type KeyringError =
  | "KEYRING_NOT_CONFIGURED"
  | "KEYRING_MALFORMED"
  | "KEY_TOO_SHORT"
  | "DUPLICATE_KEY_ID"
  | "ACTIVE_KEY_MISSING";

export interface Keyring {
  /** Identifier of the key used to sign new records. */
  readonly activeKeyId: string;
  /** Identifiers that can verify (active + retired-but-kept keys). */
  readonly keyIds: readonly string[];
  readonly signer: ProvenanceSigner;
  /** HMAC with the active key; returns the key id used. */
  sign(text: string): { keyId: string; signature: string };
  verify(text: string, signature: string, keyId: string | null): boolean;
}

/**
 * Builds the keyring from two server-only variables:
 * - PROVENANCE_SIGNING_KEYS: comma-separated `keyId:base64key` entries (>= 32 bytes each).
 *   Rotation = add a new entry, switch the active id, keep the old entry to verify history.
 * - PROVENANCE_ACTIVE_KEY_ID: the id that signs new records.
 * Errors name the problem but never echo a value.
 */
export function loadKeyring(env: Record<string, string | undefined>): { ok: true; keyring: Keyring } | { ok: false; error: KeyringError } {
  const raw = env.PROVENANCE_SIGNING_KEYS?.trim();
  const active = env.PROVENANCE_ACTIVE_KEY_ID?.trim();
  if (!raw || !active) return { ok: false, error: "KEYRING_NOT_CONFIGURED" };
  const keys = new Map<string, Buffer>();
  for (const entry of raw.split(",")) {
    const sep = entry.indexOf(":");
    const id = entry.slice(0, sep).trim();
    const b64 = entry.slice(sep + 1).trim();
    if (sep < 1 || !KEY_ID.test(id) || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return { ok: false, error: "KEYRING_MALFORMED" };
    const key = Buffer.from(b64, "base64");
    if (key.length < MIN_KEY_BYTES) return { ok: false, error: "KEY_TOO_SHORT" };
    if (keys.has(id)) return { ok: false, error: "DUPLICATE_KEY_ID" };
    keys.set(id, key);
  }
  if (!keys.has(active)) return { ok: false, error: "ACTIVE_KEY_MISSING" };

  const mac = (id: string, text: string) => createHmac("sha256", keys.get(id)!).update(text, "utf8").digest();
  const verify = (text: string, signature: string, keyId: string | null) => {
    if (!keyId || !keys.has(keyId) || typeof signature !== "string" || !/^[0-9a-f]{64}$/.test(signature)) return false;
    return timingSafeEqual(mac(keyId, text), Buffer.from(signature, "hex"));
  };
  const sign = (text: string) => ({ keyId: active, signature: mac(active, text).toString("hex") });
  const signer: ProvenanceSigner = Object.freeze({
    sign(text: string, { keyId }: { keyId: string | null }) {
      if (keyId !== active) throw new Error("only the active key signs");
      return mac(active, text).toString("hex");
    },
    verify: (text: string, signature: string, { keyId }: { keyId: string | null }) => verify(text, signature, keyId),
  });
  const keyring: Keyring = Object.freeze({ activeKeyId: active, keyIds: Object.freeze([...keys.keys()]), signer, sign, verify });
  return { ok: true, keyring };
}

let cached: Keyring | null | undefined;
/** The keyring of this server process, or null when persistence of signed data is not configured. */
export function serverKeyring(): Keyring | null {
  if (cached === undefined) {
    const loaded = loadKeyring(process.env);
    cached = loaded.ok ? loaded.keyring : null;
  }
  return cached;
}
