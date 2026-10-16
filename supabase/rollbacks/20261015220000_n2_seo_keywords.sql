-- N2-09 containment rollback ONLY after exporting declarations and confirming the scope.
-- Run in a transaction on an authorized target; this destroys keyword rows.
drop table public.seo_keywords;
