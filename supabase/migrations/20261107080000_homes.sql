-- Homes inside a community.
--
-- A community (public.groups) shares one recipe book. Inside it, admins
-- create homes; each home has its own weekly menu, grocery list and pantry,
-- and its own invite code (and link). Joining a home's code joins the home
-- and, as a member, its community. The community-wide invite code is no
-- longer used.
--
-- Everyone in a community can see and switch between all of its homes.
-- Existing communities get one home, named after the community, which keeps
-- the community's old code so codes already handed out still work.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.homes (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  invite_code text not null unique default public.generate_invite_code(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists homes_group_idx on public.homes (group_id);

-- Who lives in (joined) which home.
create table if not exists public.home_members (
  home_id uuid not null references public.homes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (home_id, user_id)
);

create index if not exists home_members_user_idx on public.home_members (user_id);

alter table public.homes enable row level security;
alter table public.home_members enable row level security;

create or replace function public.home_group(hid uuid)
returns uuid
language sql
stable
security definer set search_path = public
as $$
  select group_id from homes where id = hid;
$$;

drop policy if exists "homes member read" on public.homes;
create policy "homes member read" on public.homes for select to authenticated
  using (public.is_group_member(group_id));
drop policy if exists "homes admin insert" on public.homes;
create policy "homes admin insert" on public.homes for insert to authenticated
  with check (public.is_group_admin(group_id));
drop policy if exists "homes admin update" on public.homes;
create policy "homes admin update" on public.homes for update to authenticated
  using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));
drop policy if exists "homes admin delete" on public.homes;
create policy "homes admin delete" on public.homes for delete to authenticated
  using (public.is_group_admin(group_id));

-- People join homes with join_home(); they can leave, and admins can remove them.
drop policy if exists "home members read" on public.home_members;
create policy "home members read" on public.home_members for select to authenticated
  using (public.is_group_member(public.home_group(home_id)));
drop policy if exists "home members leave or admin remove" on public.home_members;
create policy "home members leave or admin remove" on public.home_members for delete to authenticated
  using (user_id = auth.uid() or public.is_group_admin(public.home_group(home_id)));

-- ---------------------------------------------------------------------------
-- One home for every existing community
-- ---------------------------------------------------------------------------
insert into public.homes (group_id, name, invite_code, created_by)
select g.id, g.name, g.invite_code, g.created_by
from public.groups g
where not exists (select 1 from public.homes h where h.group_id = g.id);

insert into public.home_members (home_id, user_id, joined_at)
select h.id, gm.user_id, gm.joined_at
from public.homes h
join public.group_members gm on gm.group_id = h.group_id
on conflict do nothing;

-- New communities start with a home of the same name, with the creator in it.
create or replace function public.handle_new_group()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  hid uuid;
begin
  insert into group_members (group_id, user_id, role) values (new.id, new.created_by, 'admin');
  insert into homes (group_id, name, created_by) values (new.id, new.name, new.created_by) returning id into hid;
  insert into home_members (home_id, user_id) values (hid, new.created_by);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Menu, groceries and pantry belong to a home
-- ---------------------------------------------------------------------------
alter table public.menu_items add column if not exists home_id uuid references public.homes (id) on delete cascade;
alter table public.grocery_checks add column if not exists home_id uuid references public.homes (id) on delete cascade;
alter table public.grocery_extras add column if not exists home_id uuid references public.homes (id) on delete cascade;
alter table public.pantry_items add column if not exists home_id uuid references public.homes (id) on delete cascade;

-- Each community has exactly one home at this point: move everything into it.
update public.menu_items t set home_id = (select id from public.homes h where h.group_id = t.group_id order by created_at limit 1) where home_id is null;
update public.grocery_checks t set home_id = (select id from public.homes h where h.group_id = t.group_id order by created_at limit 1) where home_id is null;
update public.grocery_extras t set home_id = (select id from public.homes h where h.group_id = t.group_id order by created_at limit 1) where home_id is null;
update public.pantry_items t set home_id = (select id from public.homes h where h.group_id = t.group_id order by created_at limit 1) where home_id is null;

alter table public.menu_items alter column home_id set not null;
alter table public.grocery_checks alter column home_id set not null;
alter table public.grocery_extras alter column home_id set not null;
alter table public.pantry_items alter column home_id set not null;

create index if not exists menu_items_home_week_idx on public.menu_items (home_id, week_start);
create index if not exists grocery_extras_home_week_idx on public.grocery_extras (home_id, week_start);

alter table public.grocery_checks drop constraint if exists grocery_checks_pkey;
alter table public.grocery_checks add primary key (home_id, week_start, item_key);

drop index if exists public.pantry_items_group_name_idx;
create unique index if not exists pantry_items_home_name_idx on public.pantry_items (home_id, lower(name));

-- group_id always follows the home, so the existing community-based
-- security policies keep working and rows can't point at another community.
-- (Row security checks run after BEFORE triggers.)
create or replace function public.set_group_from_home()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.group_id := (select group_id from homes where id = new.home_id);
  if new.group_id is null then
    raise exception 'Home not found';
  end if;
  return new;
end;
$$;

drop trigger if exists menu_items_group_from_home on public.menu_items;
create trigger menu_items_group_from_home before insert or update of home_id on public.menu_items
  for each row execute function public.set_group_from_home();
drop trigger if exists grocery_checks_group_from_home on public.grocery_checks;
create trigger grocery_checks_group_from_home before insert or update of home_id on public.grocery_checks
  for each row execute function public.set_group_from_home();
drop trigger if exists grocery_extras_group_from_home on public.grocery_extras;
create trigger grocery_extras_group_from_home before insert or update of home_id on public.grocery_extras
  for each row execute function public.set_group_from_home();
drop trigger if exists pantry_items_group_from_home on public.pantry_items;
create trigger pantry_items_group_from_home before insert or update of home_id on public.pantry_items
  for each row execute function public.set_group_from_home();

-- ---------------------------------------------------------------------------
-- Joining with a home's code (or link)
-- ---------------------------------------------------------------------------
create or replace function public.join_home(code text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  h homes%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  select * into h from homes where invite_code = upper(trim(code));
  if h.id is null then
    raise exception 'No home found with that code';
  end if;
  insert into group_members (group_id, user_id, role)
  values (h.group_id, auth.uid(), 'member')
  on conflict do nothing;
  insert into home_members (home_id, user_id)
  values (h.id, auth.uid())
  on conflict do nothing;
  return h.id;
end;
$$;

-- Older app versions call join_group: it now joins the home with that code.
create or replace function public.join_group(code text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
begin
  return public.home_group(public.join_home(code));
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.homes;
exception when duplicate_object then null;
end $$;
