"use server";

import { redirect } from "next/navigation";
import { projectAccess } from "@/lib/access";
import { currentUser } from "@/lib/auth/session";
import { serverKeyring } from "@/lib/provenance/keyring";
import { createClient } from "@/lib/supabase/server";
import { myProjectMembership } from "@/lib/tenancy";
import { n2SchemaAvailable } from "@/lib/n2/availability";
import { signContentReceipts, writerReady } from "./audit";
import { OPPORTUNITY_STATUSES, parseBrief, parseCluster, parseEvidence, parseOpportunity, type BriefStatus } from "./contract";
import * as repo from "./repository";

// N2-12 Server Actions. Same pattern as CORE-9.3/N2-11: authenticate, load the membership
// through RLS, ask the Core whether the role may perform the action, then RLS and the
// triggers decide again in the database. Hidden fields are lookup keys only.
type CoreAction = "draft" | "propose-action" | "review-action" | "delete-data";

const field = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();
const fields = (fd: FormData) => Object.fromEntries([...fd.keys()].filter((k) => !k.startsWith("$")).map((k) => [k, field(fd, k)]));
const today = () => new Date().toISOString().slice(0, 10);

async function context(fd: FormData, action: CoreAction, back: string) {
  const [user, supabase] = await Promise.all([currentUser(), createClient()]);
  if (!user || !supabase) redirect("/acceso");
  const access = projectAccess(await myProjectMembership(supabase, user.id, field(fd, "tenant"), field(fd, "project")));
  if (!access) redirect("/proyectos");
  const base = `/proyectos/${access.project.tenantId}/${access.project.projectId}/contenidos`;
  // `back` is a fixed sub-path built from validated ids, never a free URL.
  const here = `${base}${back}`;
  if (!access.permissions.find((p) => p.action === action)?.decision.allowed) redirect(`${here}?error=no-permitido`);
  if (!n2SchemaAvailable()) redirect(`${here}?error=module-unavailable`);
  const keyring = serverKeyring();
  if (!keyring || !writerReady()) redirect(`${here}?error=firma-no-configurada`);
  const project = await repo.loadContentProject(supabase, { tenantId: access.project.tenantId, projectId: access.project.projectId });
  if (!project) redirect("/proyectos");
  const done = async (path: string, notice: string, anchor = "") => {
    const signed = (await signContentReceipts(project.projectId, user.id, keyring)).ok;
    redirect(`${base}${path}?aviso=${notice}${signed ? "" : "&auditoria=pendiente"}${anchor}`);
  };
  const fail = (code: string): never => redirect(`${here}?error=${code}`);
  return { supabase, project, base, done, fail };
}

const idPath = (prefix: string, id: string) => (repo.isUuid(id) ? `/${prefix}/${id}` : "");

// ── Opportunities ──────────────────────────────────────────────────────────────────────────

export async function createOpportunity(fd: FormData): Promise<void> {
  const { supabase, project, done, fail } = await context(fd, "draft", "");
  const parsed = parseOpportunity(fields(fd), project.domain);
  if (!parsed.ok) return fail(parsed.error);
  const r = await repo.addOpportunity(supabase, project, parsed.value);
  if (!r.ok) return fail(r.error);
  await done(`/oportunidades/${r.value}`, "oportunidad-creada");
}

export async function editOpportunity(fd: FormData): Promise<void> {
  const id = field(fd, "id");
  const { supabase, project, done, fail } = await context(fd, "draft", idPath("oportunidades", id));
  const parsed = parseOpportunity(fields(fd), project.domain);
  if (!parsed.ok) return fail(parsed.error);
  const r = await repo.updateOpportunity(supabase, project, id, parsed.value);
  if (!r.ok) return fail(r.error);
  await done(`/oportunidades/${id}`, "oportunidad-actualizada");
}

export async function changeOpportunityStatus(fd: FormData): Promise<void> {
  const id = field(fd, "id");
  const { supabase, project, done, fail } = await context(fd, "draft", idPath("oportunidades", id));
  const status = field(fd, "status");
  if (!(OPPORTUNITY_STATUSES as readonly string[]).includes(status)) return fail("INVALID");
  const r = await repo.setOpportunityStatus(supabase, project, id, status as (typeof OPPORTUNITY_STATUSES)[number]);
  if (!r.ok) return fail(r.error);
  await done(`/oportunidades/${id}`, "oportunidad-estado");
}

export async function deleteOpportunity(fd: FormData): Promise<void> {
  const id = field(fd, "id");
  const { supabase, project, done, fail } = await context(fd, "delete-data", idPath("oportunidades", id));
  if (field(fd, "confirm") !== "borrar") return fail("confirmacion");
  const r = await repo.eraseOpportunity(supabase, project, id);
  if (!r.ok) return fail(r.error);
  await done("", "oportunidad-borrada");
}

// ── Evidence ───────────────────────────────────────────────────────────────────────────────

export async function addEvidence(fd: FormData): Promise<void> {
  const id = field(fd, "opportunity");
  const { supabase, project, done, fail } = await context(fd, "draft", idPath("oportunidades", id));
  const parsed = parseEvidence(fields(fd), today());
  if (!parsed.ok) return fail(parsed.error);
  const r = await repo.addEvidence(supabase, project, id, parsed.value);
  if (!r.ok) return fail(r.error);
  await done(`/oportunidades/${id}`, "evidencia-anadida", "#evidencias");
}

export async function deleteEvidence(fd: FormData): Promise<void> {
  const id = field(fd, "opportunity");
  const { supabase, project, done, fail } = await context(fd, "delete-data", idPath("oportunidades", id));
  const r = await repo.eraseEvidence(supabase, project, field(fd, "id"));
  if (!r.ok) return fail(r.error);
  await done(`/oportunidades/${id}`, "evidencia-borrada", "#evidencias");
}

// ── Clusters ───────────────────────────────────────────────────────────────────────────────

export async function createCluster(fd: FormData): Promise<void> {
  const { supabase, project, done, fail } = await context(fd, "draft", "");
  const parsed = parseCluster(fields(fd));
  if (!parsed.ok) return fail(parsed.error);
  const r = await repo.addCluster(supabase, project, parsed.value);
  if (!r.ok) return fail(r.error);
  await done(`/clusteres/${r.value}`, "cluster-creado");
}

export async function editCluster(fd: FormData): Promise<void> {
  const id = field(fd, "id");
  const { supabase, project, done, fail } = await context(fd, "draft", idPath("clusteres", id));
  const parsed = parseCluster(fields(fd));
  if (!parsed.ok) return fail(parsed.error);
  const r = await repo.updateCluster(supabase, project, id, parsed.value);
  if (!r.ok) return fail(r.error);
  await done(`/clusteres/${id}`, "cluster-actualizado");
}

export async function deleteCluster(fd: FormData): Promise<void> {
  const id = field(fd, "id");
  const { supabase, project, done, fail } = await context(fd, "delete-data", idPath("clusteres", id));
  if (field(fd, "confirm") !== "borrar") return fail("confirmacion");
  const r = await repo.eraseCluster(supabase, project, id);
  if (!r.ok) return fail(r.error);
  await done("", "cluster-borrado");
}

// ── Briefs and review ──────────────────────────────────────────────────────────────────────

export async function startBrief(fd: FormData): Promise<void> {
  const id = field(fd, "opportunity");
  const { supabase, project, done, fail } = await context(fd, "draft", idPath("oportunidades", id));
  const opportunity = await repo.getOpportunity(supabase, project, id);
  if (!opportunity) return fail("NOT_FOUND");
  const r = await repo.createBrief(supabase, project, opportunity);
  if (!r.ok && r.error !== "DUPLICATE") return fail(r.error);
  await done(`/oportunidades/${id}/brief`, r.ok ? "brief-creado" : "brief-guardado");
}

export async function saveBrief(fd: FormData): Promise<void> {
  const id = field(fd, "opportunity");
  const { supabase, project, done, fail } = await context(fd, "draft", `${idPath("oportunidades", id)}/brief`);
  const parsed = parseBrief(fields(fd), project.domain);
  if (!parsed.ok) return fail(parsed.error);
  const r = await repo.updateBrief(supabase, project, field(fd, "id"), parsed.value);
  if (!r.ok) return fail(r.error);
  await done(`/oportunidades/${id}/brief`, "brief-guardado");
}

const REVIEW: Record<string, { to: BriefStatus; action: CoreAction; notice: string }> = {
  submit: { to: "in-review", action: "propose-action", notice: "brief-enviado" },
  return: { to: "draft", action: "review-action", notice: "brief-devuelto" },
  approve: { to: "approved", action: "review-action", notice: "brief-aprobado" },
  archive: { to: "archived", action: "review-action", notice: "brief-archivado" },
  restore: { to: "draft", action: "review-action", notice: "brief-restaurado" },
};

export async function reviewBrief(fd: FormData): Promise<void> {
  const id = field(fd, "opportunity");
  const step = REVIEW[field(fd, "step")];
  const back = `${idPath("oportunidades", id)}/brief`;
  if (!step) redirect(`/proyectos`);
  const { supabase, project, done, fail } = await context(fd, step.action, back);
  const note = field(fd, "note");
  if (note.length > 500) return fail("NOTE");
  const r = await repo.setBriefStatus(supabase, project, field(fd, "id"), step.to, note || null);
  if (!r.ok) return fail(r.error);
  await done(`/oportunidades/${id}/brief`, step.notice);
}

export async function deleteBrief(fd: FormData): Promise<void> {
  const id = field(fd, "opportunity");
  const { supabase, project, done, fail } = await context(fd, "delete-data", `${idPath("oportunidades", id)}/brief`);
  if (field(fd, "confirm") !== "borrar") return fail("confirmacion");
  const r = await repo.eraseBrief(supabase, project, field(fd, "id"));
  if (!r.ok) return fail(r.error);
  await done(`/oportunidades/${id}`, "brief-borrado");
}
