-- S2: ordinary JWTs cannot enroll another identity. Membership is created only by
-- the creator triggers or the confirmed recipient accepting a project invitation.
-- No data is changed. Existing SELECT / UPDATE(role) / DELETE remain governed by RLS.
drop policy "owners add org members" on public.organization_members;
drop policy "org owners add project members" on public.project_members;

-- Table and column ACLs are independent: revoke BOTH, including created_at.
revoke insert on public.organization_members, public.project_members from public, anon, authenticated;
revoke insert (organization_id, user_id, role, created_at)
  on public.organization_members from public, anon, authenticated;
revoke insert (project_id, organization_id, user_id, role, created_at)
  on public.project_members from public, anon, authenticated;
