import type { AuthModeInfo } from "@/lib/auth/mode";

/** Blocking notices stay visible; routine diagnostics remain available on demand. */
export function ModeBanner({ auth, coreCommit }: { auth: AuthModeInfo; coreCommit: string }) {
  const content = (<>
    <strong>Rubik SEO/GEO.</strong> {auth.notice} Importación manual y auditoría técnica OpenSEO cuando el servidor esté configurado.{" "}
    <span className="nowrap">Core <code>{coreCommit}</code>.</span>
  </>);
  if (auth.canSignIn) return <details className="environment-diagnostics"><summary>Entorno y diagnóstico técnico</summary><p>{content}</p></details>;
  return (
    <div className="banner" role="status">
      <p>{content}</p>
    </div>
  );
}
