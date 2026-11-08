-- Who sees which home, and menu votes per home. Run after 20261107080000_homes.sql.
--
-- - Admins see every home in their community and can switch between them.
-- - Everyone else only sees the homes they belong to: their menu, grocery
--   list, pantry and menu votes. (Homes' names and codes too, so members can't
--   join other homes from the code.)
-- - Menu votes count for one home: a vote goes to the voter's home.
-- - Recipes and star ratings stay shared across the whole community.

create or replace function public.can_view_home(hid uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (select 1 from home_members where home_id = hid and user_id = auth.uid())
      or exists (select 1 from homes h where h.id = hid and public.is_group_admin(h.group_id));
$$;

create or replace function public.is_home_member(hid uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (select 1 from home_members where home_id = hid and user_id = auth.uid());
$$;

-- Homes and who lives in them.
drop policy if exists "homes member read" on public.homes;
create policy "homes member read" on public.homes for select to authenticated
  using (public.can_view_home(id));

drop policy if exists "home members read" on public.home_members;
create policy "home members read" on public.home_members for select to authenticated
  using (public.can_view_home(home_id));

-- Weekly menu: your home's (admins: every home). Admins still do the planning.
drop policy if exists "menu member read" on public.menu_items;
create policy "menu member read" on public.menu_items for select to authenticated
  using (public.can_view_home(home_id));

-- Grocery list.
drop policy if exists "checks member read" on public.grocery_checks;
create policy "checks member read" on public.grocery_checks for select to authenticated
  using (public.can_view_home(home_id));
drop policy if exists "checks member insert" on public.grocery_checks;
create policy "checks member insert" on public.grocery_checks for insert to authenticated
  with check (public.can_view_home(home_id) and checked_by = auth.uid());
drop policy if exists "checks member delete" on public.grocery_checks;
create policy "checks member delete" on public.grocery_checks for delete to authenticated
  using (public.can_view_home(home_id));

drop policy if exists "extras member read" on public.grocery_extras;
create policy "extras member read" on public.grocery_extras for select to authenticated
  using (public.can_view_home(home_id));

-- Pantry: each home has its own.
drop policy if exists "pantry member read" on public.pantry_items;
create policy "pantry member read" on public.pantry_items for select to authenticated
  using (public.can_view_home(home_id));
drop policy if exists "pantry member insert" on public.pantry_items;
create policy "pantry member insert" on public.pantry_items for insert to authenticated
  with check (public.can_view_home(home_id));
drop policy if exists "pantry member update" on public.pantry_items;
create policy "pantry member update" on public.pantry_items for update to authenticated
  using (public.can_view_home(home_id)) with check (public.can_view_home(home_id));
drop policy if exists "pantry member delete" on public.pantry_items;
create policy "pantry member delete" on public.pantry_items for delete to authenticated
  using (public.can_view_home(home_id));

-- ---------------------------------------------------------------------------
-- Menu votes per home
-- ---------------------------------------------------------------------------
alter table public.menu_votes add column if not exists home_id uuid references public.homes (id) on delete cascade;

-- Existing votes go to the voter's first home in the recipe's community.
update public.menu_votes v
set home_id = (
  select hm.home_id
  from public.home_members hm
  join public.homes h on h.id = hm.home_id
  join public.recipes r on r.id = v.recipe_id and r.group_id = h.group_id
  where hm.user_id = v.user_id
  order by hm.joined_at
  limit 1
)
where v.home_id is null;

delete from public.menu_votes where home_id is null;

alter table public.menu_votes alter column home_id set not null;
alter table public.menu_votes drop constraint if exists menu_votes_pkey;
alter table public.menu_votes add primary key (recipe_id, user_id, home_id);
create index if not exists menu_votes_home_idx on public.menu_votes (home_id, created_at);

drop policy if exists "votes member read" on public.menu_votes;
create policy "votes member read" on public.menu_votes for select to authenticated
  using (public.can_view_home(home_id));

-- You vote for your own home, for a recipe in that home's community.
drop policy if exists "votes self insert" on public.menu_votes;
create policy "votes self insert" on public.menu_votes for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_home_member(home_id)
    and exists (select 1 from public.recipes r where r.id = recipe_id and r.group_id = public.home_group(home_id))
  );

-- Voting again in a new week refreshes the vote's date (an upsert).
drop policy if exists "votes self update" on public.menu_votes;
create policy "votes self update" on public.menu_votes for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_home_member(home_id));

drop policy if exists "votes self delete" on public.menu_votes;
create policy "votes self delete" on public.menu_votes for delete to authenticated
  using (user_id = auth.uid());
