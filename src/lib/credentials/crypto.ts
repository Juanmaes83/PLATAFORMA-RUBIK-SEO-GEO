import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Per-client provider credentials (ADR 0010): authenticated encryption in the server process.
// The database only ever stores ciphertext bound by associated data to one credential row
// (credential id, organization, project, provider, key id). The keys live in a server-only
// environment variable, like the provenance HMAC keyring: never in the database, Git, logs,
// errors or the browser. A browser holding the user's JWT can at most read ciphertext.

const KEY_ID = /^[a-z0-9][a-z0-9-]{1,62}$/;
const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // GCM standard nonce
const TAG_BYTES = 16;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROVIDER = /^[a-z0-9][a-z0-9-]{1,40}$/;
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

export type CredentialKeyringError = "CREDENTIAL_KEYS_PUBLIC" | "CREDENTIAL_KEYS_NOT_CONFIGURED" | "CREDENTIAL_KEYS_MALFORMED" | "CREDENTIAL_KEY_SIZE" | "CREDENTIAL_KEY_DUPLICATE" | "CREDENTIAL_ACTIVE_KEY_MISSING";

/** Where a credential belongs. Every field is authenticated: change one and decryption fails. */
export interface CredentialBinding {
  credentialId: string;
  organizationId: string;
  projectId: string;
  provider: string;
}

/** Stored form. Only this shape may reach the database. */
export interface SealedCredential {
  v: 1;
  keyId: string;
  iv: string;
  ciphertext: string;
  tag: string;
}

export interface CredentialKeyring {
  readonly activeKeyId: string;
  readonly keyIds: readonly string[];
  seal(secret: string, binding: CredentialBinding): SealedCredential;
  /** null on any failure (unknown key, tampering, other binding): never an exception text. */
  open(sealed: unknown, binding: CredentialBinding): string | null;
  /** Rotation: re-seal with the active key; null if the old one cannot be opened. */
  reseal(sealed: unknown, binding: CredentialBinding): SealedCredential | null;
}

const validBinding = (b: CredentialBinding) =>
  !!b && UUID.test(b.credentialId) && UUID.test(b.organizationId) && UUID.test(b.projectId) && PROVIDER.test(b.provider);

/** Canonical associated data. The key id is included so a sealed value cannot claim another key. */
const aad = (b: CredentialBinding, keyId: string) =>
  Buffer.from(["rubik-credential-v1", b.credentialId, b.organizationId, b.projectId, b.provider, keyId].join("|"), "utf8");

/**
 * CREDENTIALS_ENCRYPTION_KEYS: comma-separated `keyId:base64key` (exactly 32 bytes each).
 * CREDENTIALS_ACTIVE_KEY_ID: the id that seals new values. Rotation: add a key, switch the
 * active id, reseal stored values, and only then remove the old key. Errors never echo values.
 */
export function loadCredentialKeyring(env: Record<string, string | undefined>):
  { ok: true; keyring: CredentialKeyring } | { ok: false; error: CredentialKeyringError } {
  // A NEXT_PUBLIC_ variable is inlined into the browser bundle: refuse to start with one.
  if (Object.keys(env).some((name) => name.startsWith("NEXT_PUBLIC_") && /CREDENTIAL/i.test(name))) return { ok: false, error: "CREDENTIAL_KEYS_PUBLIC" };
  const raw = env.CREDENTIALS_ENCRYPTION_KEYS?.trim();
  const active = env.CREDENTIALS_ACTIVE_KEY_ID?.trim();
  if (!raw || !active) return { ok: false, error: "CREDENTIAL_KEYS_NOT_CONFIGURED" };
  const keys = new Map<string, Buffer>();
  for (const entry of raw.split(",")) {
    const sep = entry.indexOf(":");
    const id = entry.slice(0, sep).trim();
    const b64 = entry.slice(sep + 1).trim();
    if (sep < 1 || !KEY_ID.test(id) || !B64.test(b64)) return { ok: false, error: "CREDENTIAL_KEYS_MALFORMED" };
    const key = Buffer.from(b64, "base64");
    if (key.length !== KEY_BYTES) return { ok: false, error: "CREDENTIAL_KEY_SIZE" };
    if (keys.has(id)) return { ok: false, error: "CREDENTIAL_KEY_DUPLICATE" };
    keys.set(id, key);
  }
  if (!keys.has(active)) return { ok: false, error: "CREDENTIAL_ACTIVE_KEY_MISSING" };

  const seal = (secret: string, binding: CredentialBinding): SealedCredential => {
    if (typeof secret !== "string" || !secret || !validBinding(binding)) throw new TypeError("invalid credential or binding");
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", keys.get(active)!, iv, { authTagLength: TAG_BYTES });
    cipher.setAAD(aad(binding, active));
    const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    return { v: 1, keyId: active, iv: iv.toString("base64"), ciphertext: ciphertext.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
  };

  const open = (sealed: unknown, binding: CredentialBinding): string | null => {
    const s = sealed as Partial<SealedCredential> | null;
    if (!s || typeof s !== "object" || s.v !== 1 || typeof s.keyId !== "string" || !keys.has(s.keyId) || !validBinding(binding)
      || typeof s.iv !== "string" || typeof s.ciphertext !== "string" || typeof s.tag !== "string"
      || !B64.test(s.iv) || !B64.test(s.ciphertext) || !B64.test(s.tag)) return null;
    const iv = Buffer.from(s.iv, "base64");
    const tag = Buffer.from(s.tag, "base64");
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return null;
    try {
      const decipher = createDecipheriv("aes-256-gcm", keys.get(s.keyId)!, iv, { authTagLength: TAG_BYTES });
      decipher.setAAD(aad(binding, s.keyId));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(Buffer.from(s.ciphertext, "base64")), decipher.final()]).toString("utf8");
    } catch {
      return null;
    }
  };

  const reseal = (sealed: unknown, binding: CredentialBinding) => {
    const secret = open(sealed, binding);
    return secret === null ? null : seal(secret, binding);
  };

  return { ok: true, keyring: Object.freeze({ activeKeyId: active, keyIds: Object.freeze([...keys.keys()]), seal, open, reseal }) };
}

let cached: CredentialKeyring | null | undefined;
/** The credential keyring of this server process, or null while the owner has not configured it. */
export function serverCredentialKeyring(): CredentialKeyring | null {
  if (cached === undefined) {
    const loaded = loadCredentialKeyring(process.env);
    cached = loaded.ok ? loaded.keyring : null;
  }
  return cached;
}
