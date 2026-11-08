-- Join a home by picking it from a list; only a home's creator is its admin.
-- Run after 20261107100000_homes_first.sql.
--
-- - Signed-in people can see every home's name (not its code, menu or
--   pantry) so they can pick one to join. Joining makes you a member.
-- - The person who created a home is its only admin. Nobody can make anyone
--   else an admin, and existing admins of homes they didn't create become
--   members.

-- Creator = admin, everyone else = member.
update public.home_members hm
set role = case when h.created_by = hm.user_id then 'admin' else 'member' end
from public.homes h
where h.id = hm.home_id;

-- Roles can no longer be changed from the app.
drop policy if exists "home members admin update" on public.home_members;

-- Every home's name, for the "join a home" list. Only for signed-in people.
create or replace function public.list_homes()
returns table (id uuid, name text)
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  return query select h.id, h.name from homes h order by lower(h.name);
end;
$$;

-- Join a home picked from the list, as a member. Returns the home's id.
create or replace function public.join_home_by_id(hid uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if not exists (select 1 from homes where id = hid) then
    raise exception 'That home no longer exists';
  end if;
  insert into home_members (home_id, user_id, role)
  values (hid, auth.uid(), 'member')
  on conflict do nothing;
  return hid;
end;
$$;
