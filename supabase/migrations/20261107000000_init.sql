-- Thresholds Shared Kitchen: initial schema
-- Groups (communities), members with roles, recipes, ratings, pantries,
-- weekly menus and shared grocery checklists. Row level security everywhere.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Groups and membership
-- ---------------------------------------------------------------------------
create or replace function public.generate_invite_code()
returns text
language sql
volatile
as $$
  -- 6 characters, no easily-confused letters or digits (0/O, 1/I/L)
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
  from generate_series(1, 6);
$$;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '',
  invite_code text not null unique default public.generate_invite_code(),
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index group_members_user_idx on public.group_members (user_id);

-- Membership helpers. SECURITY DEFINER so policies can call them without
-- recursing into group_members' own policies.
create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (select 1 from group_members where group_id = gid and user_id = auth.uid());
$$;

create or replace function public.is_group_admin(gid uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (select 1 from group_members where group_id = gid and user_id = auth.uid() and role = 'admin');
$$;

-- The creator of a group becomes its first admin.
create or replace function public.handle_new_group()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into group_members (group_id, user_id, role) values (new.id, new.created_by, 'admin');
  return new;
end;
$$;

create trigger on_group_created
  after insert on public.groups
  for each row execute function public.handle_new_group();

-- Join a group with its invite code. Non-members cannot see groups, so this
-- runs as definer and only exposes the group it joins.
create or replace function public.join_group(code text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  gid uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  select id into gid from groups where invite_code = upper(trim(code));
  if gid is null then
    raise exception 'No group found with that invite code';
  end if;
  insert into group_members (group_id, user_id, role)
  values (gid, auth.uid(), 'member')
  on conflict do nothing;
  return gid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Recipes and ratings
-- ---------------------------------------------------------------------------
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '',
  servings int check (servings is null or servings > 0),
  total_minutes int check (total_minutes is null or total_minutes >= 0),
  -- [{ "name": "rolled oats", "quantity": 2, "unit": "cup" }]
  ingredients jsonb not null default '[]'::jsonb,
  steps text[] not null default '{}',
  dietary_tags text[] not null default '{}',
  photo_path text,
  video_url text,
  source text not null default 'manual' check (source in ('manual', 'photo', 'youtube')),
  created_at timestamptz not null default now()
);

create index recipes_group_idx on public.recipes (group_id, created_at desc);

create table public.recipe_ratings (
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  score int not null check (score between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (recipe_id, user_id)
);

-- Aggregate rating per recipe. security_invoker so RLS on the base tables applies.
create view public.recipe_stats
with (security_invoker = true)
as
select
  r.id as recipe_id,
  r.group_id,
  count(rr.score)::int as rating_count,
  coalesce(avg(rr.score), 0)::float as avg_score
from public.recipes r
left join public.recipe_ratings rr on rr.recipe_id = r.id
group by r.id, r.group_id;

-- ---------------------------------------------------------------------------
-- Personal pantry
-- ---------------------------------------------------------------------------
create table public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);

create unique index pantry_items_user_name_idx on public.pantry_items (user_id, lower(name));

-- ---------------------------------------------------------------------------
-- Weekly menu (admins plan, everyone in the group sees it)
-- ---------------------------------------------------------------------------
create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  week_start date not null, -- the Monday of the week
  day smallint not null check (day between 0 and 6), -- 0 = Monday
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner')),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index menu_items_week_idx on public.menu_items (group_id, week_start);

-- Shared grocery checklist state for a group's week.
create table public.grocery_checks (
  group_id uuid not null references public.groups (id) on delete cascade,
  week_start date not null,
  item_key text not null,
  checked_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  checked_at timestamptz not null default now(),
  primary key (group_id, week_start, item_key)
);

-- Extra grocery items an admin adds by hand (not from a recipe).
create table public.grocery_extras (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  week_start date not null,
  name text not null check (char_length(name) between 1 and 80),
  quantity numeric not null default 0,
  unit text not null default '',
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ratings enable row level security;
alter table public.pantry_items enable row level security;
alter table public.menu_items enable row level security;
alter table public.grocery_checks enable row level security;
alter table public.grocery_extras enable row level security;

-- Profiles: any signed-in user can read names (shown on recipes); only you edit yours.
create policy "profiles readable" on public.profiles for select to authenticated using (true);
create policy "profiles self update" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Groups
create policy "groups member read" on public.groups for select to authenticated
  using (public.is_group_member(id) or created_by = auth.uid());
create policy "groups create" on public.groups for insert to authenticated
  with check (created_by = auth.uid());
create policy "groups admin update" on public.groups for update to authenticated
  using (public.is_group_admin(id)) with check (public.is_group_admin(id));
create policy "groups admin delete" on public.groups for delete to authenticated
  using (public.is_group_admin(id));

-- Members: see your group's roster; admins manage roles and remove people; anyone can leave.
create policy "members read" on public.group_members for select to authenticated
  using (public.is_group_member(group_id));
create policy "members admin update" on public.group_members for update to authenticated
  using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));
create policy "members leave or admin remove" on public.group_members for delete to authenticated
  using (user_id = auth.uid() or public.is_group_admin(group_id));

-- Recipes: members read and add; authors and admins edit or delete.
create policy "recipes member read" on public.recipes for select to authenticated
  using (public.is_group_member(group_id));
create policy "recipes member insert" on public.recipes for insert to authenticated
  with check (public.is_group_member(group_id) and author_id = auth.uid());
create policy "recipes author or admin update" on public.recipes for update to authenticated
  using (author_id = auth.uid() or public.is_group_admin(group_id))
  with check (author_id = auth.uid() or public.is_group_admin(group_id));
create policy "recipes author or admin delete" on public.recipes for delete to authenticated
  using (author_id = auth.uid() or public.is_group_admin(group_id));

-- Ratings: members of the recipe's group read all ratings; you manage your own.
create policy "ratings member read" on public.recipe_ratings for select to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and public.is_group_member(r.group_id)));
create policy "ratings self insert" on public.recipe_ratings for insert to authenticated
  with check (user_id = auth.uid()
    and exists (select 1 from public.recipes r where r.id = recipe_id and public.is_group_member(r.group_id)));
create policy "ratings self update" on public.recipe_ratings for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "ratings self delete" on public.recipe_ratings for delete to authenticated
  using (user_id = auth.uid());

-- Pantry: private to each user.
create policy "pantry self" on public.pantry_items for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Menu: members read; admins write.
create policy "menu member read" on public.menu_items for select to authenticated
  using (public.is_group_member(group_id));
create policy "menu admin insert" on public.menu_items for insert to authenticated
  with check (public.is_group_admin(group_id)
    and exists (select 1 from public.recipes r where r.id = recipe_id and r.group_id = menu_items.group_id));
create policy "menu admin update" on public.menu_items for update to authenticated
  using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));
create policy "menu admin delete" on public.menu_items for delete to authenticated
  using (public.is_group_admin(group_id));

-- Grocery checks: any member can tick items off the shared list.
create policy "checks member read" on public.grocery_checks for select to authenticated
  using (public.is_group_member(group_id));
create policy "checks member insert" on public.grocery_checks for insert to authenticated
  with check (public.is_group_member(group_id) and checked_by = auth.uid());
create policy "checks member delete" on public.grocery_checks for delete to authenticated
  using (public.is_group_member(group_id));

-- Grocery extras: members read; admins write.
create policy "extras member read" on public.grocery_extras for select to authenticated
  using (public.is_group_member(group_id));
create policy "extras admin insert" on public.grocery_extras for insert to authenticated
  with check (public.is_group_admin(group_id));
create policy "extras admin delete" on public.grocery_extras for delete to authenticated
  using (public.is_group_admin(group_id));

-- ---------------------------------------------------------------------------
-- Storage: recipe photos, stored under "<group_id>/<file>"
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('recipe-photos', 'recipe-photos', true)
on conflict (id) do nothing;

create policy "recipe photos member upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'recipe-photos'
    and public.is_group_member(((storage.foldername(name))[1])::uuid)
  );

create policy "recipe photos owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'recipe-photos' and owner = auth.uid());

-- Realtime so menus, ratings and grocery ticks update live across phones.
alter publication supabase_realtime add table public.recipes, public.recipe_ratings, public.menu_items, public.grocery_checks, public.grocery_extras;
