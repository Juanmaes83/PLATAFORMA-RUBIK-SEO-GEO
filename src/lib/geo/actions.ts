"use server";

import { redirect } from "next/navigation";
import { projectAccess } from "@/lib/access";
import { contentGeoSchemaAvailable } from "@/lib/n2/availability";
import { currentUser } from "@/lib/auth/session";
import { serverKeyring } from "@/lib/provenance/keyring";
import { createClient } from "@/lib/supabase/server";
import { myProjectMembership } from "@/lib/tenancy";
import { signGeoReceipts, writerReady } from "./audit";
import { parseObservation } from "./contract";
import * as repo from "./repository";
import { opportunities, type Rule } from "./rules";

// N2-13 Server Actions: authenticate, load the membership through RLS, ask the Core whether the
// role may act, then RLS and the triggers decide again. Proposals are rebuilt on the server
// from the stored observations; the form only names the rule and the question.
type CoreAction = "draft" | "approve-fact" | "review-action" | "delete-data";

const field = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();
const fields = (fd: FormData) => Object.fromEntries([...fd.keys()].filter((k) => !k.startsWith("$")).map((k) => [k, field(fd, k)]));

async function context(fd: FormData, action: CoreAction, back: string) {
  const [user, supabase] = await Promise.all([currentUser(), createClient()]);
  if (!user || !supabase) redirect("/acceso");
  const access = projectAccess(await myProjectMembership(supabase, user.id, field(fd, "tenant"), field(fd, "project")));
  if (!access) redirect("/proyectos");
  const base = `/proyectos/${access.project.tenantId}/${access.project.projectId}/geo`;
  const here = `${base}${back}`;
  if (!contentGeoSchemaAvailable()) redirect(`${here}?error=module-unavailable`);
  if (!access.permissions.find((p) => p.action === action)?.decision.allowed) redirect(`${here}?error=no-permitido`);
  const keyring = serverKeyring();
  if (!keyring || !writerReady()) redirect(`${here}?error=firma-no-configurada`);
  const project = await repo.loadGeoProject(supabase, { tenantId: access.project.tenantId, projectId: access.project.projectId });
  if (!project) redirect("/proyectos");
  const done = async (path: string, notice: string) => {
    const signed = (await signGeoReceipts(project.projectId, user.id, keyring)).ok;
    redirect(`${base}${path}?aviso=${notice}${signed ? "" : "&auditoria=pendiente"}`);
  };
  const fail = (code: string): never => redirect(`${here}?error=${code}`);
  return { supabase, project, done, fail };
}
const idPath = (prefix: string, id: string) => (repo.isUuid(id) ? `/${prefix}/${id}` : "");

export async function recordObservation(fd: FormData): Promise<void> {
  const { supabase, project, done, fail } = await context(fd, "draft", "");
  const parsed = parseObservation(fields(fd), new Date().toISOString().slice(0, 10));
  if (!parsed.ok) return fail(parsed.error);
  const r = await repo.addObservation(supabase, project, parsed.value);
  if (!r.ok) return fail(r.error);
  await done(`/observaciones/${r.value}`, "observacion-registrada");
}

export async function verifyObservation(fd: FormData): Promise<void> {
  const id = field(fd, "id");
  const { supabase, project, done, fail } = await context(fd, "approve-fact", idPath("observaciones", id));
  const r = await repo.verifyObservation(supabase, project, id);
  if (!r.ok) return fail(r.error);
  await done(`/observaciones/${id}`, "observacion-verificada");
}

export async function deleteObservation(fd: FormData): Promise<void> {
  const id = field(fd, "id");
  const { supabase, project, done, fail } = await context(fd, "delete-data", idPath("observaciones", id));
  if (field(fd, "confirm") !== "borrar") return fail("confirmacion");
  const r = await repo.eraseObservation(supabase, project, id);
  if (!r.ok) return fail(r.error);
  await done("", "observacion-borrada");
}

export async function createProposal(fd: FormData): Promise<void> {
  const { supabase, project, done, fail } = await context(fd, "draft", "");
  const rule = field(fd, "rule") as Rule;
  const key = field(fd, "key");
  const found = opportunities(await repo.listObservations(supabase, project), project.domain).find((o) => o.rule === rule && o.key === key);
  if (!found) return fail("NO_OPPORTUNITY");
  const r = await repo.addProposal(supabase, project, found);
  if (!r.ok) return fail(r.error);
  await done(`/propuestas/${r.value}`, "propuesta-creada");
}

const STEPS: Record<string, { to: repo.Proposal["status"]; notice: string }> = {
  accept: { to: "accepted", notice: "propuesta-aceptada" },
  reject: { to: "rejected", notice: "propuesta-rechazada" },
  done: { to: "done", notice: "propuesta-hecha" },
  reopen: { to: "proposed", notice: "propuesta-reabierta" },
};

export async function reviewProposal(fd: FormData): Promise<void> {
  const id = field(fd, "id");
  const step = STEPS[field(fd, "step")];
  if (!step) redirect("/proyectos");
  const { supabase, project, done, fail } = await context(fd, "review-action", idPath("propuestas", id));
  const note = field(fd, "note");
  if (note.length > 500) return fail("NOTE");
  const r = await repo.setProposalStatus(supabase, project, id, step.to, note || null);
  if (!r.ok) return fail(r.error);
  await done(`/propuestas/${id}`, step.notice);
}

export async function deleteProposal(fd: FormData): Promise<void> {
  const id = field(fd, "id");
  const { supabase, project, done, fail } = await context(fd, "delete-data", idPath("propuestas", id));
  if (field(fd, "confirm") !== "borrar") return fail("confirmacion");
  const r = await repo.eraseProposal(supabase, project, id);
  if (!r.ok) return fail(r.error);
  await done("", "propuesta-borrada");
}
