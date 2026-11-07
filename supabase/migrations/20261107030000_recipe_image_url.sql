-- A picture of the dish found online (TheMealDB or Wikipedia), used when the
-- recipe has no uploaded photo.
alter table public.recipes add column if not exists image_url text;
