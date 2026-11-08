-- Gallery photos are shown anonymously, labelled with the home they came
-- from instead of the person who posted them. Homes are private to their
-- members, so the home's name is stored on the photo when it's added.

alter table public.recipe_gallery
  add column if not exists home_id uuid references public.homes (id) on delete set null,
  add column if not exists home_name text not null default '';

-- Fill in the home's name from the database (the app only says which home),
-- and only for a home the poster actually belongs to.
create or replace function public.gallery_home_name()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.home_id is not null and public.is_home_member(new.home_id) then
    new.home_name := coalesce((select name from homes where id = new.home_id), '');
  else
    new.home_id := null;
    new.home_name := '';
  end if;
  return new;
end;
$$;

drop trigger if exists recipe_gallery_home_name on public.recipe_gallery;
create trigger recipe_gallery_home_name
  before insert on public.recipe_gallery
  for each row execute function public.gallery_home_name();
