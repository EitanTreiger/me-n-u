-- Fix: "new row violates row-level security policy for table homes" when
-- creating a home. Run after 20261107110000_join_from_list_creator_admin.sql.
--
-- Creating a home and reading it back in one request was refused: you can
-- only see homes you're a member of, and the creator is only added as the
-- home's admin a moment later. Let people always see the homes they created.

drop policy if exists "homes member read" on public.homes;
create policy "homes member read" on public.homes for select to authenticated
  using (created_by = auth.uid() or public.is_home_member(id));
