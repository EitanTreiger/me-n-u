-- Seconds into the source video where each step happens (same order as
-- recipes.steps; -1 when unknown). Only set for YouTube recipes.
alter table public.recipes add column if not exists step_timestamps int[];

-- Pantry amounts: "5 eggs", "2 cup rice". quantity 0 = amount not tracked.
alter table public.pantry_items add column if not exists quantity numeric not null default 0;
alter table public.pantry_items add column if not exists unit text not null default '';

-- Members vote for recipes they'd like on the weekly menu.
create table if not exists public.menu_votes (
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (recipe_id, user_id)
);

alter table public.menu_votes enable row level security;

create policy "votes member read" on public.menu_votes for select to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and public.is_group_member(r.group_id)));
create policy "votes self insert" on public.menu_votes for insert to authenticated
  with check (user_id = auth.uid()
    and exists (select 1 from public.recipes r where r.id = recipe_id and public.is_group_member(r.group_id)));
create policy "votes self delete" on public.menu_votes for delete to authenticated
  using (user_id = auth.uid());
