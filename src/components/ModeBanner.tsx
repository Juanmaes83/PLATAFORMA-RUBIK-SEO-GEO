import type { AuthModeInfo } from "@/lib/auth/mode";

/** Always-visible notice about what this environment is and is not. */
export function ModeBanner({ auth, coreCommit }: { auth: AuthModeInfo; coreCommit: string }) {
  return (
    <div className="banner" role="status">
      <p>
        <strong>CORE-9.3 · sin desplegar.</strong> {auth.notice} Sin conectores, IA ni datos de clientes; solo importación manual de datos declarados.{" "}
        <span className="nowrap">Core <code>{coreCommit}</code>.</span>
      </p>
    </div>
  );
}
