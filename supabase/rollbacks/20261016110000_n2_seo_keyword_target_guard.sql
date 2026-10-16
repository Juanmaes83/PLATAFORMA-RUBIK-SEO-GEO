-- Containment only: preserve existing declarations and deny JWT writes if this
-- guard must be withdrawn. Do not silently restore the insecure direct-write path.
begin;
revoke insert, update on public.seo_keywords from public, anon, authenticated;
commit;
