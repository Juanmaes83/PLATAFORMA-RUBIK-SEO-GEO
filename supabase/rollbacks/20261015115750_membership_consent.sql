-- MANUAL emergency rollback only. Restores the pre-S2 weakness; requires review.
-- Does not remove memberships or invitations. Never run automatically or hosted.
begin;
grant insert (organization_id, user_id, role) on public.organization_members to authenticated;
grant insert (project_id, organization_id, user_id, role) on public.project_members to authenticated;
create policy "owners add org members" on public.organization_members
  for insert to authenticated with check ((select private.is_org_owner(organization_id)));
create policy "org owners add project members" on public.project_members
  for insert to authenticated with check ((select private.is_org_owner(organization_id)));
commit;
