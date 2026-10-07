import "server-only";

import { platform, providers, type ProvenanceVerification, type SignedProvenance } from "@/lib/core";
import { sha256, type Keyring } from "./keyring";
import type { ProjectRef } from "./audit";

// Signed provider results (ADR 0004, Core D-28). Only a result the Core's CORE-7 module
// issued in this process can be sealed; reading verifies signature, digest algorithm and data
// and returns the result rebuilt by the Core, which offpage accepts with `platform` injected.

/** A row of public.provider_results. */
export interface ProviderResultRow {
  id?: string;
  project_id: string;
  organization_id: string;
  provider: string;
  operation: string;
  status: string;
  captured_at: string | null;
  signed_payload: unknown;
  data: unknown;
  data_hash_alg: string;
  data_hash: string;
  key_id: string;
  signature: string;
}

export function sealProviderResult(
  result: unknown,
  project: ProjectRef,
  keyring: Keyring,
): { ok: true; row: ProviderResultRow } | { ok: false; error: string } {
  const sealed = platform.signProvenance(result, { providers, signer: keyring.signer, keyId: keyring.activeKeyId, digest: sha256 });
  if (!sealed.ok) return { ok: false, error: sealed.error.code };
  const { payload, signature } = sealed.signed;
  const p = payload as SignedProvenance["payload"] & { provider: string; operation: string; status: string; provenance?: { capturedAt?: string } };
  return {
    ok: true,
    row: {
      project_id: project.projectId,
      organization_id: project.organizationId,
      provider: p.provider,
      operation: p.operation,
      status: p.status,
      captured_at: p.provenance?.capturedAt ?? null,
      signed_payload: payload,
      // JSON round trip: what is stored is exactly what the digest covered.
      data: JSON.parse(JSON.stringify((result as { data?: unknown }).data ?? null)),
      data_hash_alg: p.dataHashAlg,
      data_hash: p.dataHash,
      key_id: keyring.activeKeyId,
      signature,
    },
  };
}

export function openProviderResult(row: ProviderResultRow, keyring: Keyring): ProvenanceVerification {
  const signed: SignedProvenance = {
    payload: row.signed_payload as SignedProvenance["payload"],
    keyId: row.key_id,
    signature: row.signature,
  };
  return platform.verifyProvenance(signed, { signer: keyring.signer, data: row.data, digest: sha256 });
}
