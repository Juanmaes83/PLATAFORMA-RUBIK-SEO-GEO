"use client";

import { useActionState } from "react";
import { createInvitationAction } from "@/lib/invitation-actions";
import { INVITATION_ERRORS } from "@/lib/invitation-messages";

// Creates one invitation and shows its link ONCE. The platform sends nothing: the owner copies
// the link and delivers it personally to the invited address.
export function InvitationForm({ tenant, project, roles }: { tenant: string; project: string; roles: { id: string; label: string }[] }) {
  const [state, create, creating] = useActionState(createInvitationAction, null);
  return (
    <>
      <form action={create} className="card form">
        <input type="hidden" name="tenant" value={tenant} />
        <input type="hidden" name="project" value={project} />
        <div className="field">
          <label htmlFor="inv-email">Correo de la persona invitada</label>
          <input id="inv-email" name="email" type="email" autoComplete="off" required />
        </div>
        <div className="field">
          <label htmlFor="inv-role">Rol en este proyecto</label>
          <select id="inv-role" name="role" required defaultValue="viewer">
            {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
        <button type="submit" className="btn btn-block" disabled={creating}>{creating ? "Creando…" : "Crear enlace de invitación"}</button>
      </form>
      {state && (state.ok ? (
        <div className="card" role="status">
          <p><strong>Enlace para {state.email}</strong>. Cópialo ahora: no se volverá a mostrar.</p>
          <p className="break"><code>{state.link}</code></p>
          <p className="muted small">Caduca el {new Date(state.expiresAt).toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Madrid" })}. Solo funciona una vez y con la cuenta de ese correo, ya confirmada.</p>
        </div>
      ) : (
        <p className="notice notice-error" role="alert">{INVITATION_ERRORS[state.error] ?? INVITATION_ERRORS.INVITATION_UNAVAILABLE}</p>
      ))}
    </>
  );
}
