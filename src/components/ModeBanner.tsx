import type { AuthModeInfo } from "@/lib/auth/mode";

/** Always-visible notice: nothing in CORE-9.0 is connected or real. */
export function ModeBanner({ auth, coreCommit }: { auth: AuthModeInfo; coreCommit: string }) {
  return (
    <div className="banner" role="status">
      <strong>Entorno local · CORE-9.0.</strong> {auth.notice} Sin servicios conectados, datos
      reales ni despliegue. Core fijado en <code>{coreCommit}</code>.
    </div>
  );
}
