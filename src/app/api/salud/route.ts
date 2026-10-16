import { requestAuthMode } from "@/lib/auth/session";
import { supabasePublicConfig } from "@/lib/auth/mode";
import { corePin, platform } from "@/lib/core";

// Technical status for local checks. Only the public Supabase project ref is shown:
// no key, database query or call to an external service.
export async function GET() {
  const auth = await requestAuthMode();
  const host = (() => {
    try {
      return new URL(supabasePublicConfig(process.env)?.url ?? "").hostname;
    } catch {
      return "";
    }
  })();
  const supabaseProjectRef = /^([a-z0-9]{20})\.supabase\.co$/.exec(host)?.[1] ?? null;
  return Response.json({
    status: "ok",
    stage: "CORE-9.3",
    auth: auth.mode,
    core: { repository: corePin.repository, commit: corePin.commit, roles: platform.ROLES.length },
    integrations: platform.CONNECTORS.map((c) => ({ id: c.id, status: c.status })),
    persistence: auth.mode === "supabase" ? "supabase" : "none",
    supabaseProjectRef,
    deployment: "none",
  });
}
