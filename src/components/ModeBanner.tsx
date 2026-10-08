import type { AuthModeInfo } from "@/lib/auth/mode";

/** Always-visible notice about what this environment is and is not. */
export function ModeBanner({ auth, coreCommit }: { auth: AuthModeInfo; coreCommit: string }) {
  return (
    <div className="banner" role="status">
      <p>
        <strong>Rubik SEO/GEO.</strong> {auth.notice} Importación manual y auditoría técnica OpenSEO cuando el servidor esté configurado.{" "}
        <span className="nowrap">Core <code>{coreCommit}</code>.</span>
      </p>
    </div>
  );
}
