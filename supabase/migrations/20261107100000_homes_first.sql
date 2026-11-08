-- Homes are the top level. Run after 20261107090000_home_access_and_votes.sql.
--
-- - Anyone can create a home and becomes its admin; others join with the
--   home's code or link. People can belong to several homes.
-- - Admin rights belong to one home (home_members.role). Being an admin of
--   one home gives nothing in another: to see another home's menu, groceries
--   or pantry you join it as a member.
-- - Recipes, star ratings and recipe photos (including the new per-recipe
--   gallery) are shared by everyone on the app.
-- - Menu votes count for one home; only that home's admins see the counts.
--
-- Communities (public.groups) are no longer used by the app. Their tables
-- and columns stay so nothing is lost, but nothing depends on them any more.

-- ---------------------------------------------------------------------------
-- Admins per home
-- ---------------------------------------------------------------------------
alter table public.home_members
  add column if not exists role text not null default 'member' check (role in ('admin', 'member'));

-- Community admins become admins of the homes they're in.
update public.home_members hm
set role = 'admin'
from public.homes h
join public.group_members gm on gm.group_id = h.group_id
where hm.home_id = h.id and gm.user_id = hm.user_id and gm.role = 'admin';

-- Whoever created a home is its admin (admins who added extra homes weren't
-- members of them yet).
insert into public.home_members (home_id, user_id, role)
select h.id, h.created_by, 'admin'
from public.homes h
where h.created_by is not null
on conflict (home_id, user_id) do update set role = 'admin';

-- Homes no longer need a community.
alter table public.homes alter column group_id drop not null;

create or replace function public.is_home_admin(hid uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (select 1 from home_members where home_id = hid and user_id = auth.uid() and role = 'admin');
$$;

-- You can see a home only by belonging to it.
create or replace function public.can_view_home(hid uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.is_home_member(hid);
$$;

-- The person who creates a home is its first admin.
create or replace function public.handle_new_home()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.created_by is not null then
    insert into home_members (home_id, user_id, role) values (new.id, new.created_by, 'admin')
    on conflict (home_id, user_id) do update set role = 'admin';
  end if;
  return new;
end;
$$;

drop trigger if exists on_home_created on public.homes;
create trigger on_home_created
  after insert on public.homes
  for each row execute function public.handle_new_home();

-- (Old path, unused by the app: a new community's first home now gets its
-- admin from the trigger above.)
create or replace function public.handle_new_group()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into group_members (group_id, user_id, role) values (new.id, new.created_by, 'admin');
  insert into homes (group_id, name, created_by) values (new.id, new.name, new.created_by);
  return new;
end;
$$;

-- Create a home and become its admin; returns the new home's id. (A plain
-- insert can't read the new row back: you only become a member once the
-- trigger has run.)
create or replace function public.create_home(home_name text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  hid uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if char_length(trim(coalesce(home_name, ''))) not between 1 and 80 then
    raise exception 'Give the home a name (up to 80 characters)';
  end if;
  insert into homes (name, created_by) values (trim(home_name), auth.uid()) returning id into hid;
  return hid;
end;
$$;

-- Joining with a code makes you a member of that home only.
create or replace function public.join_home(code text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  hid uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  select id into hid from homes where invite_code = upper(trim(code));
  if hid is null then
    raise exception 'No home found with that code';
  end if;
  insert into home_members (home_id, user_id, role)
  values (hid, auth.uid(), 'member')
  on conflict do nothing;
  return hid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Homes and their members
-- ---------------------------------------------------------------------------
drop policy if exists "homes member read" on public.homes;
create policy "homes member read" on public.homes for select to authenticated
  using (public.is_home_member(id));
drop policy if exists "homes admin insert" on public.homes;
drop policy if exists "homes create" on public.homes;
create policy "homes create" on public.homes for insert to authenticated
  with check (created_by = auth.uid());
drop policy if exists "homes admin update" on public.homes;
create policy "homes admin update" on public.homes for update to authenticated
  using (public.is_home_admin(id)) with check (public.is_home_admin(id));
drop policy if exists "homes admin delete" on public.homes;
create policy "homes admin delete" on public.homes for delete to authenticated
  using (public.is_home_admin(id));

drop policy if exists "home members read" on public.home_members;
create policy "home members read" on public.home_members for select to authenticated
  using (public.is_home_member(home_id));
drop policy if exists "home members admin update" on public.home_members;
create policy "home members admin update" on public.home_members for update to authenticated
  using (public.is_home_admin(home_id)) with check (public.is_home_admin(home_id));
drop policy if exists "home members leave or admin remove" on public.home_members;
create policy "home members leave or admin remove" on public.home_members for delete to authenticated
  using (user_id = auth.uid() or public.is_home_admin(home_id));

-- ---------------------------------------------------------------------------
-- Menu, groceries and pantry: by home only
-- ---------------------------------------------------------------------------
-- group_id used to be filled from the home; homes may not have a community now.
drop trigger if exists menu_items_group_from_home on public.menu_items;
drop trigger if exists grocery_checks_group_from_home on public.grocery_checks;
drop trigger if exists grocery_extras_group_from_home on public.grocery_extras;
drop trigger if exists pantry_items_group_from_home on public.pantry_items;
alter table public.menu_items alter column group_id drop not null;
alter table public.grocery_checks alter column group_id drop not null;
alter table public.grocery_extras alter column group_id drop not null;
alter table public.pantry_items alter column group_id drop not null;

-- Weekly menu: the home's members read it; its admins plan it.
drop policy if exists "menu member read" on public.menu_items;
create policy "menu member read" on public.menu_items for select to authenticated
  using (public.is_home_member(home_id));
drop policy if exists "menu admin insert" on public.menu_items;
create policy "menu admin insert" on public.menu_items for insert to authenticated
  with check (public.is_home_admin(home_id));
drop policy if exists "menu admin update" on public.menu_items;
create policy "menu admin update" on public.menu_items for update to authenticated
  using (public.is_home_admin(home_id)) with check (public.is_home_admin(home_id));
drop policy if exists "menu admin delete" on public.menu_items;
create policy "menu admin delete" on public.menu_items for delete to authenticated
  using (public.is_home_admin(home_id));

-- Grocery ticks: any member of the home.
drop policy if exists "checks member read" on public.grocery_checks;
create policy "checks member read" on public.grocery_checks for select to authenticated
  using (public.is_home_member(home_id));
drop policy if exists "checks member insert" on public.grocery_checks;
create policy "checks member insert" on public.grocery_checks for insert to authenticated
  with check (public.is_home_member(home_id) and checked_by = auth.uid());
drop policy if exists "checks member delete" on public.grocery_checks;
create policy "checks member delete" on public.grocery_checks for delete to authenticated
  using (public.is_home_member(home_id));

-- Grocery extras: members read; the home's admins add and remove.
drop policy if exists "extras member read" on public.grocery_extras;
create policy "extras member read" on public.grocery_extras for select to authenticated
  using (public.is_home_member(home_id));
drop policy if exists "extras admin insert" on public.grocery_extras;
create policy "extras admin insert" on public.grocery_extras for insert to authenticated
  with check (public.is_home_admin(home_id));
drop policy if exists "extras admin delete" on public.grocery_extras;
create policy "extras admin delete" on public.grocery_extras for delete to authenticated
  using (public.is_home_admin(home_id));

-- Pantry: the home's members.
drop policy if exists "pantry member read" on public.pantry_items;
create policy "pantry member read" on public.pantry_items for select to authenticated
  using (public.is_home_member(home_id));
drop policy if exists "pantry member insert" on public.pantry_items;
create policy "pantry member insert" on public.pantry_items for insert to authenticated
  with check (public.is_home_member(home_id));
drop policy if exists "pantry member update" on public.pantry_items;
create policy "pantry member update" on public.pantry_items for update to authenticated
  using (public.is_home_member(home_id)) with check (public.is_home_member(home_id));
drop policy if exists "pantry member delete" on public.pantry_items;
create policy "pantry member delete" on public.pantry_items for delete to authenticated
  using (public.is_home_member(home_id));

-- ---------------------------------------------------------------------------
-- Menu votes: you vote for a home you belong to; only its admins see counts
-- ---------------------------------------------------------------------------
drop policy if exists "votes member read" on public.menu_votes;
create policy "votes member read" on public.menu_votes for select to authenticated
  using (user_id = auth.uid() or public.is_home_admin(home_id));
drop policy if exists "votes self insert" on public.menu_votes;
create policy "votes self insert" on public.menu_votes for insert to authenticated
  with check (user_id = auth.uid() and public.is_home_member(home_id));
drop policy if exists "votes self update" on public.menu_votes;
create policy "votes self update" on public.menu_votes for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_home_member(home_id));

-- ---------------------------------------------------------------------------
-- Recipes and ratings: shared by everyone
-- ---------------------------------------------------------------------------
alter table public.recipes alter column group_id drop not null;

drop policy if exists "recipes member read" on public.recipes;
drop policy if exists "recipes everyone read" on public.recipes;
create policy "recipes everyone read" on public.recipes for select to authenticated
  using (true);
drop policy if exists "recipes member insert" on public.recipes;
drop policy if exists "recipes self insert" on public.recipes;
create policy "recipes self insert" on public.recipes for insert to authenticated
  with check (author_id = auth.uid());
-- Recipes belong to whoever added them: they edit and delete them.
drop policy if exists "recipes author or admin update" on public.recipes;
drop policy if exists "recipes author update" on public.recipes;
create policy "recipes author update" on public.recipes for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
drop policy if exists "recipes author or admin delete" on public.recipes;
drop policy if exists "recipes admin delete" on public.recipes;
drop policy if exists "recipes author delete" on public.recipes;
create policy "recipes author delete" on public.recipes for delete to authenticated
  using (author_id = auth.uid());

drop policy if exists "ratings member read" on public.recipe_ratings;
drop policy if exists "ratings everyone read" on public.recipe_ratings;
create policy "ratings everyone read" on public.recipe_ratings for select to authenticated
  using (true);
drop policy if exists "ratings self insert" on public.recipe_ratings;
create policy "ratings self insert" on public.recipe_ratings for insert to authenticated
  with check (user_id = auth.uid());

-- Recipe photos: uploaded under "<user_id>/<file>" now (old ones stay under
-- "<group_id>/<file>" and keep working).
drop policy if exists "recipe photos self upload" on storage.objects;
create policy "recipe photos self upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Gallery: photos people took when they made a recipe, shared by everyone
-- ---------------------------------------------------------------------------
create table if not exists public.recipe_gallery (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  photo_path text not null,
  caption text not null default '' check (char_length(caption) <= 200),
  created_at timestamptz not null default now()
);

create index if not exists recipe_gallery_recipe_idx on public.recipe_gallery (recipe_id, created_at desc);

alter table public.recipe_gallery enable row level security;

drop policy if exists "gallery everyone read" on public.recipe_gallery;
create policy "gallery everyone read" on public.recipe_gallery for select to authenticated
  using (true);
drop policy if exists "gallery self insert" on public.recipe_gallery;
create policy "gallery self insert" on public.recipe_gallery for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "gallery self delete" on public.recipe_gallery;
create policy "gallery self delete" on public.recipe_gallery for delete to authenticated
  using (user_id = auth.uid());
