"use server";

import { redirect } from "next/navigation";
import { projectAccess } from "@/lib/access";
import { currentUser } from "@/lib/auth/session";
import { serverKeyring } from "@/lib/provenance/keyring";
import { createClient } from "@/lib/supabase/server";
import { myProjectMembership } from "@/lib/tenancy";
import { n2SchemaAvailable } from "@/lib/n2/availability";
import { signCompetitorReceipts, writerReady } from "./audit";
import { parseCompetitorDetails, parseObservation } from "./contract";
import { normalizeCompetitorDomain } from "./domain";
import {
  addCompetitor, addObservation, eraseCompetitor, eraseObservation, findCompetitorByDomain, isUuid, loadCompetitorProject,
  setCompetitorStatus, updateCompetitor, verifyObservation,
} from "./repository";

// N2-11 Server Actions. Same pattern as CORE-9.3: authenticate, load the membership through
// RLS, ask the Core whether the role may perform the action, then RLS and the database
// triggers decide again. Hidden tenant/project fields are only lookup keys; competitor and
// observation ids are bound to the project's database id in every query.
type CoreAction = "draft" | "review-action" | "approve-fact" | "delete-data";

const field = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();
const fields = (formData: FormData, names: readonly string[]) => Object.fromEntries(names.map((n) => [n, field(formData, n)]));

async function context(formData: FormData, action: CoreAction, back?: string) {
  const [user, supabase] = await Promise.all([currentUser(), createClient()]);
  if (!user || !supabase) redirect("/acceso");
  const access = projectAccess(await myProjectMembership(supabase, user.id, field(formData, "tenant"), field(formData, "project")));
  if (!access) redirect("/proyectos");
  const base = `/proyectos/${access.project.tenantId}/${access.project.projectId}/competidores`;
  const here = back && isUuid(back) ? `${base}/${back}` : base;
  if (!access.permissions.find((p) => p.action === action)?.decision.allowed) redirect(`${here}?error=no-permitido`);
  if (!n2SchemaAvailable()) redirect(`${here}?error=module-unavailable`);
  const keyring = serverKeyring();
  if (!keyring || !writerReady()) redirect(`${here}?error=firma-no-configurada`);
  const project = await loadCompetitorProject(supabase, { tenantId: access.project.tenantId, projectId: access.project.projectId });
  if (!project) redirect("/proyectos");
  const sign = async () => (await signCompetitorReceipts(project.projectId, user.id, keyring)).ok;
  return { supabase, project, base, here, sign };
}

const audited = (ok: boolean) => (ok ? "" : "&auditoria=pendiente");

export async function createCompetitor(formData: FormData): Promise<void> {
  const { supabase, project, base, sign } = await context(formData, "draft");
  const normalized = normalizeCompetitorDomain(field(formData, "domain"));
  if (!normalized.ok) redirect(`${base}?error=${normalized.error}`);
  const own = project.domain ? normalizeCompetitorDomain(project.domain) : null;
  if (own?.ok && own.domain === normalized.domain) redirect(`${base}?error=SAME_AS_PROJECT`);
  const details = parseCompetitorDetails(fields(formData, ["name", "notes", "relation"]));
  if (!details.ok) redirect(`${base}?error=${details.error}`);
  const created = await addCompetitor(supabase, project, normalized.domain, details.value);
  if (!created.ok && created.error === "DUPLICATE") {
    // Idempotent: a second submission (or a different spelling of the same site) opens the existing one.
    const existing = await findCompetitorByDomain(supabase, project, normalized.domain);
    if (existing) redirect(`${base}/${existing}?aviso=existente`);
  }
  if (!created.ok) redirect(`${base}?error=${created.error === "NOT_ALLOWED" ? "no-permitido" : created.error}`);
  redirect(`${base}/${created.value}?aviso=creado${audited(await sign())}`);
}

export async function editCompetitor(formData: FormData): Promise<void> {
  const id = field(formData, "id");
  const { supabase, project, here, sign } = await context(formData, "draft", id);
  const details = parseCompetitorDetails(fields(formData, ["name", "notes", "relation"]));
  if (!details.ok) redirect(`${here}?error=${details.error}`);
  const result = await updateCompetitor(supabase, project, id, details.value);
  if (!result.ok) redirect(`${here}?error=${result.error === "NOT_ALLOWED" ? "no-permitido" : result.error}`);
  redirect(`${here}?aviso=actualizado${audited(await sign())}`);
}

export async function changeCompetitorStatus(formData: FormData): Promise<void> {
  const id = field(formData, "id");
  const { supabase, project, here, sign } = await context(formData, "review-action", id);
  const status = field(formData, "status") === "archived" ? "archived" : "active";
  const result = await setCompetitorStatus(supabase, project, id, status);
  if (!result.ok) redirect(`${here}?error=${result.error === "NOT_ALLOWED" ? "no-permitido" : result.error}`);
  redirect(`${here}?aviso=${status === "archived" ? "archivado" : "restaurado"}${audited(await sign())}`);
}

export async function deleteCompetitor(formData: FormData): Promise<void> {
  const id = field(formData, "id");
  const { supabase, project, base, here, sign } = await context(formData, "delete-data", id);
  if (field(formData, "confirm") !== "borrar") redirect(`${here}?error=confirmacion`);
  const result = await eraseCompetitor(supabase, project, id);
  if (!result.ok) redirect(`${here}?error=${result.error === "NOT_ALLOWED" ? "no-permitido" : result.error}`);
  redirect(`${base}?aviso=borrado${audited(await sign())}`);
}

const OBSERVATION_FIELDS = ["competitor", "metric", "availability", "value", "method", "source", "reference", "observedOn", "country", "language", "device", "notes"] as const;

export async function recordObservation(formData: FormData): Promise<void> {
  const competitor = field(formData, "competitor");
  const { supabase, project, here, sign } = await context(formData, "draft", competitor);
  const parsed = parseObservation(fields(formData, OBSERVATION_FIELDS), new Date().toISOString().slice(0, 10));
  if (!parsed.ok) redirect(`${here}?error=${parsed.error}`);
  const result = await addObservation(supabase, project, parsed.value);
  if (!result.ok) {
    const code = result.error === "DUPLICATE" ? "DUPLICATE_OBSERVATION" : result.error === "NOT_ALLOWED" ? "no-permitido" : result.error;
    redirect(`${here}?error=${code}`);
  }
  redirect(`${here}?aviso=observacion${audited(await sign())}#observaciones`);
}

export async function confirmObservation(formData: FormData): Promise<void> {
  const { supabase, project, here, sign } = await context(formData, "approve-fact", field(formData, "competitor"));
  const result = await verifyObservation(supabase, project, field(formData, "id"));
  if (!result.ok) redirect(`${here}?error=${result.error === "NOT_ALLOWED" ? "no-permitido" : result.error}`);
  redirect(`${here}?aviso=verificada${audited(await sign())}#observaciones`);
}

export async function deleteObservation(formData: FormData): Promise<void> {
  const { supabase, project, here, sign } = await context(formData, "delete-data", field(formData, "competitor"));
  const result = await eraseObservation(supabase, project, field(formData, "id"));
  if (!result.ok) redirect(`${here}?error=${result.error === "NOT_ALLOWED" ? "no-permitido" : result.error}`);
  redirect(`${here}?aviso=observacion-borrada${audited(await sign())}#observaciones`);
}
