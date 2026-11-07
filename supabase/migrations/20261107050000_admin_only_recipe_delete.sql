-- Only group admins can delete recipes (authors can still edit their own).
drop policy if exists "recipes author or admin delete" on public.recipes;
drop policy if exists "recipes admin delete" on public.recipes;
create policy "recipes admin delete" on public.recipes for delete to authenticated
  using (public.is_group_admin(group_id));
