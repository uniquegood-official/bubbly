-- Fix: RLS infinite recursion on workspace_members
-- Problem: workspace_members SELECT policy references workspace_members itself,
-- causing infinite recursion. All other tables' policies also reference
-- workspace_members, so everything breaks.
-- Solution: Use a SECURITY DEFINER helper function that bypasses RLS.

-- 1. Create helper function (security definer = bypasses RLS)
create or replace function public.is_workspace_member(ws_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws_id and user_id = auth.uid()
  );
$$;

create or replace function public.get_workspace_role(ws_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.workspace_members
  where workspace_id = ws_id and user_id = auth.uid()
  limit 1;
$$;

grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.get_workspace_role(uuid) to authenticated;

-- 2. Fix workspace_members policies (self-referencing → use helper)
drop policy if exists "Members can view co-members" on public.workspace_members;
drop policy if exists "Owners can add members" on public.workspace_members;
drop policy if exists "Owners can update member roles" on public.workspace_members;
drop policy if exists "Owners can remove members and members can leave" on public.workspace_members;

create policy "Members can view co-members" on public.workspace_members for select
  using (public.is_workspace_member(workspace_id));

create policy "Owners can add members" on public.workspace_members for insert
  with check (public.get_workspace_role(workspace_id) = 'owner');

create policy "Owners can update member roles" on public.workspace_members for update
  using (public.get_workspace_role(workspace_id) = 'owner')
  with check (public.get_workspace_role(workspace_id) = 'owner');

create policy "Owners can remove members and members can leave" on public.workspace_members for delete
  using (
    user_id = auth.uid()
    or public.get_workspace_role(workspace_id) = 'owner'
  );

-- 3. Fix workspaces policies (use helper instead of subquery)
drop policy if exists "Workspaces viewable by members" on public.workspaces;

create policy "Workspaces viewable by members" on public.workspaces for select
  using (public.is_workspace_member(id));

-- 4. Fix tasks policies
drop policy if exists "Tasks viewable by workspace members" on public.tasks;
drop policy if exists "Editors can add tasks" on public.tasks;
drop policy if exists "Editors can update tasks" on public.tasks;
drop policy if exists "Editors can delete tasks" on public.tasks;

create policy "Tasks viewable by workspace members" on public.tasks for select
  using (public.is_workspace_member(workspace_id));

create policy "Editors can add tasks" on public.tasks for insert
  with check (
    owner_id = auth.uid()
    and public.get_workspace_role(workspace_id) in ('owner', 'editor')
  );

create policy "Editors can update tasks" on public.tasks for update
  using (public.get_workspace_role(workspace_id) in ('owner', 'editor'));

create policy "Editors can delete tasks" on public.tasks for delete
  using (public.get_workspace_role(workspace_id) in ('owner', 'editor'));

-- 5. Fix share_links policies
drop policy if exists "Owners can view share links" on public.workspace_share_links;
drop policy if exists "Owners can create share links" on public.workspace_share_links;
drop policy if exists "Owners can update share links" on public.workspace_share_links;
drop policy if exists "Owners can delete share links" on public.workspace_share_links;

create policy "Owners can view share links" on public.workspace_share_links for select
  using (public.get_workspace_role(workspace_id) = 'owner');

create policy "Owners can create share links" on public.workspace_share_links for insert
  with check (public.get_workspace_role(workspace_id) = 'owner');

create policy "Owners can update share links" on public.workspace_share_links for update
  using (public.get_workspace_role(workspace_id) = 'owner');

create policy "Owners can delete share links" on public.workspace_share_links for delete
  using (public.get_workspace_role(workspace_id) = 'owner');
