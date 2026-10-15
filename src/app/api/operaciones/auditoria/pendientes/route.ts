import { createHash, timingSafeEqual } from "node:crypto";
import { drainAuditOutbox, pendingAuditOutbox } from "@/lib/provenance/outbox";
import { serverKeyring } from "@/lib/provenance/keyring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Operator-only capability. The route accepts no event body or project/actor fields.
function authorized(request: Request): boolean {
  const expected = process.env.RUBIK_AUDIT_DRAIN_TOKEN;
  const supplied = request.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/)?.[1];
  if (!expected || expected.length < 32 || !supplied) return false;
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(expected), hash(supplied));
}

function gate(request: Request): Response | null {
  if (!process.env.RUBIK_AUDIT_DRAIN_TOKEN) return new Response(null, { status: 404 });
  if (!authorized(request)) return new Response(null, { status: 401, headers: { "Cache-Control": "no-store" } });
  return null;
}

export async function GET(request: Request) {
  const denied = gate(request);
  if (denied) return denied;
  try {
    return Response.json(await pendingAuditOutbox(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "STATUS_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  const denied = gate(request);
  if (denied) return denied;
  const keyring = serverKeyring();
  if (!keyring) return Response.json({ error: "KEYRING_NOT_CONFIGURED" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  try {
    const result = await drainAuditOutbox(keyring);
    return Response.json(result, { status: result.failed ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "DRAIN_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
