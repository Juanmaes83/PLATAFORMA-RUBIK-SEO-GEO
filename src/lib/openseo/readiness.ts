import type { OpenSeoProjectConnection } from "./connections";

// Read-only checklist before switching a project to OPENSEO_PROJECT_CONNECTIONS_MODE=project
// (docs/OPENSEO-ACTIVATION.md, section B). It never activates anything: the variable and the
// redeploy are the owner's separate decision. Comparisons with the global configuration only
// say whether values match; the values themselves are never returned.

export type CheckState = "ok" | "blocked" | "review";
export interface ReadinessCheck { id: string; state: CheckState; text: string }
export interface Readiness { ready: boolean; checks: ReadinessCheck[] }

type Env = Record<string, string | undefined>;
const list = (v: string | undefined) => (v ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);

export function projectModeReadiness(input: {
  env: Env;
  projectDomain: string;
  connection: { ok: true; connection: OpenSeoProjectConnection | null } | { ok: false };
  activeJob: { ok: true; job: { state: string } | null } | { ok: false } | null;
}): Readiness {
  const { env, connection, activeJob } = input;
  const domain = input.projectDomain.trim().toLowerCase();
  const checks: ReadinessCheck[] = [];
  const add = (id: string, state: CheckState, text: string) => checks.push({ id, state, text });

  add("jobs", env.OPENSEO_PROJECT_JOBS_ENABLED === "true" ? "ok" : "blocked",
    env.OPENSEO_PROJECT_JOBS_ENABLED === "true" ? "Registro de trabajos activado en el servidor." : "El registro de trabajos no está activado: el modo por proyecto lo exige.");

  const active = connection.ok && connection.connection?.state === "ACTIVE" ? connection.connection : null;
  if (!connection.ok) add("connection", "blocked", "No se pudo leer la conexión del proyecto.");
  else add("connection", active ? "ok" : "blocked", active ? "Conexión del proyecto activa, con consentimiento registrado." : "Falta crear la conexión del proyecto con el identificador real de OpenSEO y consentimiento.");

  if (active) {
    add("hosts", domain && active.allowedHosts.includes(domain) ? "ok" : "blocked",
      domain && active.allowedHosts.includes(domain) ? `Los hosts de la conexión incluyen ${domain}.` : "Los hosts de la conexión no incluyen el dominio del proyecto.");
  }

  if (!activeJob || !activeJob.ok) add("jobs-active", "blocked", "No se pudo comprobar si hay trabajos activos.");
  else add("jobs-active", activeJob.job ? "blocked" : "ok",
    activeJob.job ? "Hay un trabajo activo: espera a que termine o reconcílialo antes de cambiar de modo." : "Ningún trabajo activo en este proyecto.");

  if (active) {
    const globalId = (env.OPENSEO_PROJECT_ID ?? "").trim();
    add("same-destination", !globalId ? "review" : globalId === active.openseoProjectId ? "ok" : "review",
      !globalId ? "No hay proyecto global configurado con el que comparar: confirma el identificador en la cuenta de OpenSEO."
        : globalId === active.openseoProjectId ? "El proyecto de OpenSEO de la conexión coincide con el que usa hoy la configuración global."
          : "El proyecto de OpenSEO de la conexión es distinto del que usa hoy la configuración global: al activar el modo cambiará el destino. Confírmalo antes.");
    const globalHosts = list(env.OPENSEO_AUDIT_ALLOWED_HOSTS);
    const lost = globalHosts.filter((h) => (h === domain || h === `www.${domain.replace(/^www\./, "")}` || h === domain.replace(/^www\./, "")) && !active.allowedHosts.includes(h));
    add("hosts-change", lost.length ? "review" : "ok",
      lost.length ? `Hoy se puede auditar ${lost.join(", ")} y la conexión no lo incluye: dejará de ser auditable en modo por proyecto.` : "Los hosts de este dominio que hoy se auditan siguen incluidos en la conexión.");
  }
  return { ready: checks.every((c) => c.state !== "blocked"), checks };
}
