import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/supabase/database.types";

// Test fixtures use the same JWT-bound consent flow as the application, never admin INSERT.
export async function consentedMembership(owner: SupabaseClient<Database>, recipient: SupabaseClient<Database>,
  projectId: string, role: "account-manager" | "analyst" | "client-approver" | "viewer") {
  const identity = await recipient.auth.getUser();
  if (identity.error || !identity.data.user?.email) throw new Error("Fixture recipient must be signed in");
  const created = await owner.rpc("project_invitations", { p_project_id: projectId, p_command: "create",
    p_payload: { email: identity.data.user.email, role } });
  if (created.error) throw created.error;
  const invitation = created.data as { invitationId: string; token: string };
  const accepted = await recipient.rpc("accept_project_invitation", { p_token: invitation.token });
  if (accepted.error) throw accepted.error;
  if ((accepted.data as { role: string }).role !== role) throw new Error("Fixture accepted unexpected role");
  return invitation.invitationId;
}
