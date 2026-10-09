-- Rollback of 20261012090000_project_invitations.sql (ADR 0020). Run only with a backup, then
-- `npx supabase@2.118.0 migration repair --status reverted 20261012090000`.
-- Drops pending and historical invitations; memberships created by accepted invitations stay.
drop function if exists public.accept_project_invitation(text);
drop function if exists public.project_invitations(uuid, text, jsonb);
drop function if exists private.accept_project_invitation(text);
drop function if exists private.project_invitation_command(uuid, text, jsonb);
drop table if exists private.project_invitations;
