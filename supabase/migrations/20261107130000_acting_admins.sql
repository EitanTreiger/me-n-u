-- Acting admins; groceries and pantry for admins only; only admins delete
-- recipes. Run after 20261107120000_creator_can_see_home.sql.
--
-- Roles in a home:
--   admin         the person who created the home
--   acting_admin  someone the creator made an admin: the same access as the
--                 creator (menu, votes, groceries, pantry, deleting recipes),
--                 but can't make others admins. The creator can undo it.
--   member        everyone else
--
-- "Admin" below means admin or acting admin.

alter table public.home_members drop constraint if exists home_members_role_check;
alter table public.home_members
  add constraint home_members_role_check check (role in ('admin', 'acting_admin', 'member'));

-- Admin access: the creator or an acting admin.
create or replace function public.is_home_admin(hid uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from home_members where home_id = hid and user_id = auth.uid() and role in ('admin', 'acting_admin')
  );
$$;

-- The home's creator.
create or replace function public.is_home_owner(hid uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (select 1 from home_members where home_id = hid and user_id = auth.uid() and role = 'admin');
$$;

-- The creator makes a member an acting admin, or back to a member.
create or replace function public.set_acting_admin(hid uuid, member_id uuid, acting boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_home_owner(hid) then
    raise exception 'Only the person who created this home can change who is an admin';
  end if;
  update home_members
  set role = case when acting then 'acting_admin' else 'member' end
  where home_id = hid and user_id = member_id and role <> 'admin';
  if not found then
    raise exception 'That person is not in this home';
  end if;
end;
$$;

-- Renaming or deleting a home, and removing people from it: the creator only.
drop policy if exists "homes admin update" on public.homes;
create policy "homes admin update" on public.homes for update to authenticated
  using (public.is_home_owner(id)) with check (public.is_home_owner(id));
drop policy if exists "homes admin delete" on public.homes;
create policy "homes admin delete" on public.homes for delete to authenticated
  using (public.is_home_owner(id));
drop policy if exists "home members leave or admin remove" on public.home_members;
create policy "home members leave or admin remove" on public.home_members for delete to authenticated
  using (user_id = auth.uid() or public.is_home_owner(home_id));

-- Groceries: admins only.
drop policy if exists "checks member read" on public.grocery_checks;
create policy "checks member read" on public.grocery_checks for select to authenticated
  using (public.is_home_admin(home_id));
drop policy if exists "checks member insert" on public.grocery_checks;
create policy "checks member insert" on public.grocery_checks for insert to authenticated
  with check (public.is_home_admin(home_id) and checked_by = auth.uid());
drop policy if exists "checks member delete" on public.grocery_checks;
create policy "checks member delete" on public.grocery_checks for delete to authenticated
  using (public.is_home_admin(home_id));
drop policy if exists "extras member read" on public.grocery_extras;
create policy "extras member read" on public.grocery_extras for select to authenticated
  using (public.is_home_admin(home_id));

-- Pantry: admins only.
drop policy if exists "pantry member read" on public.pantry_items;
create policy "pantry member read" on public.pantry_items for select to authenticated
  using (public.is_home_admin(home_id));
drop policy if exists "pantry member insert" on public.pantry_items;
create policy "pantry member insert" on public.pantry_items for insert to authenticated
  with check (public.is_home_admin(home_id));
drop policy if exists "pantry member update" on public.pantry_items;
create policy "pantry member update" on public.pantry_items for update to authenticated
  using (public.is_home_admin(home_id)) with check (public.is_home_admin(home_id));
drop policy if exists "pantry member delete" on public.pantry_items;
create policy "pantry member delete" on public.pantry_items for delete to authenticated
  using (public.is_home_admin(home_id));

-- Recipes are shared by every home: admins (of any home) delete them.
drop policy if exists "recipes author delete" on public.recipes;
drop policy if exists "recipes admin delete" on public.recipes;
create policy "recipes admin delete" on public.recipes for delete to authenticated
  using (exists (
    select 1 from public.home_members where user_id = auth.uid() and role in ('admin', 'acting_admin')
  ));
