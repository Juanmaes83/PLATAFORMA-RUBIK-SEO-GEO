-- Containment only: preserve existing declarations and deny JWT writes if this
-- guard must be withdrawn. Do not silently restore the insecure direct-write path.
begin;
revoke insert, update on public.seo_keywords from public, anon, authenticated;
revoke insert (project_id, organization_id, phrase, language_code, country_code, intent, topic, target_url)
  on public.seo_keywords from public, anon, authenticated;
revoke update (intent, topic, target_url, updated_at)
  on public.seo_keywords from public, anon, authenticated;
commit;
