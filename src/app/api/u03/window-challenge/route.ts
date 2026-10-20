import { NextResponse } from "next/server";
import { createPreviewWindowAttestation } from "@/lib/provenance/keyring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stateless challenge that proves a local DPAPI batch matches this protected deployment. */
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || typeof (body as Record<string, unknown>).runId !== "string" ||
        typeof (body as Record<string, unknown>).nonce !== "string") return NextResponse.json({ ok: false }, { status: 404 });
    const attestation = createPreviewWindowAttestation(process.env, new URL(request.url).host,
      { runId: (body as { runId: string }).runId, nonce: (body as { nonce: string }).nonce });
    if (!attestation) return NextResponse.json({ ok: false }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json(attestation, { headers: { "Cache-Control": "no-store", "Pragma": "no-cache" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
}
