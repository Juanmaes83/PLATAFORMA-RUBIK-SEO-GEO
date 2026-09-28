import { requestAuthMode } from "@/lib/auth/session";
import { corePin, platform } from "@/lib/core";

// Technical status for local checks. It reports configuration only: no secret, no
// environment value and no call to any external service.
export async function GET() {
  const auth = await requestAuthMode();
  return Response.json({
    status: "ok",
    stage: "CORE-9.0",
    auth: auth.mode,
    core: { repository: corePin.repository, commit: corePin.commit, roles: platform.ROLES.length },
    integrations: platform.CONNECTORS.map((c) => ({ id: c.id, status: c.status })),
    persistence: "none",
    deployment: "none",
  });
}
