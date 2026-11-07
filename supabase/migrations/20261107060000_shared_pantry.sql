-- The pantry belongs to the community (the home), not to one person:
-- every member sees and updates the same pantry.

alter table public.pantry_items
  add column if not exists group_id uuid references public.groups (id) on delete cascade;

-- Move existing items into the community their owner joined first.
update public.pantry_items p
set group_id = (
  select gm.group_id from public.group_members gm
  where gm.user_id = p.user_id
  order by gm.joined_at
  limit 1
)
where p.group_id is null;

delete from public.pantry_items where group_id is null;

-- Merge duplicates created by people in the same community.
delete from public.pantry_items a
using public.pantry_items b
where a.group_id = b.group_id and lower(a.name) = lower(b.name) and a.created_at > b.created_at;

alter table public.pantry_items alter column group_id set not null;

drop index if exists public.pantry_items_user_name_idx;
create unique index if not exists pantry_items_group_name_idx on public.pantry_items (group_id, lower(name));

-- user_id now just records who added the item.
drop policy if exists "pantry self" on public.pantry_items;
create policy "pantry member read" on public.pantry_items for select to authenticated
  using (public.is_group_member(group_id));
create policy "pantry member insert" on public.pantry_items for insert to authenticated
  with check (public.is_group_member(group_id));
create policy "pantry member update" on public.pantry_items for update to authenticated
  using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
create policy "pantry member delete" on public.pantry_items for delete to authenticated
  using (public.is_group_member(group_id));
