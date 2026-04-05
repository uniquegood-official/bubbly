-- Bubbly migration: mobile/share v1
-- Apply this to an existing Supabase project that was created from the older schema.
-- This migration is written to be re-runnable where practical.

create extension if not exists pgcrypto;

-- 1. Expand task model
alter table public.tasks
  add column if not exists color text;

-- 2. Upgrade workspace roles
update public.workspace_members
set role = 'editor'
where role = 'member';

alter table public.workspace_members
  alter column role set default 'viewer';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'workspace_members_role_check'
      and conrelid = 'public.workspace_members'::regclass
  ) then
    alter table public.workspace_members drop constraint workspace_members_role_check;
  end if;
end $$;

alter table public.workspace_members
  add constraint workspace_members_role_check
  check (role in ('owner', 'editor', 'viewer'));

-- 3. Share links table
create table if not exists public.workspace_share_links (
  id uuid default gen_random_uuid() primary key,
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  role text not null check (role in ('viewer', 'editor')),
  token text unique not null default encode(gen_random_bytes(18), 'hex'),
  created_by uuid references public.profiles(id) on delete cascade not null,
  revoked_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz default now()
);

alter table public.workspace_share_links enable row level security;

-- 4. Helper + redeem/create RPCs
create or replace function public.workspace_role_rank(role_input text)
returns integer as $$
begin
  return case role_input
    when 'viewer' then 1
    when 'editor' then 2
    when 'owner' then 3
    else 0
  end;
end;
$$ language plpgsql immutable;

create or replace function public.join_workspace_by_invite(invite_code_input text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace_id uuid;
  current_role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select id into target_workspace_id
  from public.workspaces
  where invite_code = invite_code_input;

  if target_workspace_id is null then
    raise exception 'Invite not found';
  end if;

  select role into current_role
  from public.workspace_members
  where workspace_id = target_workspace_id
    and user_id = auth.uid();

  if current_role is null then
    insert into public.workspace_members (workspace_id, user_id, role)
    values (target_workspace_id, auth.uid(), 'editor');
  end if;

  return target_workspace_id;
end;
$$;

create or replace function public.ensure_workspace_share_link(
  workspace_id_input uuid,
  link_role_input text,
  rotate_input boolean default false
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  member_role text;
  existing_token text;
  next_token text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if link_role_input not in ('viewer', 'editor') then
    raise exception 'Invalid share role';
  end if;

  select role into member_role
  from public.workspace_members
  where workspace_id = workspace_id_input
    and user_id = auth.uid();

  if member_role is distinct from 'owner' then
    raise exception 'Only workspace owners can manage share links';
  end if;

  if rotate_input then
    update public.workspace_share_links
    set revoked_at = now()
    where workspace_id = workspace_id_input
      and role = link_role_input
      and revoked_at is null;
  else
    select token into existing_token
    from public.workspace_share_links
    where workspace_id = workspace_id_input
      and role = link_role_input
      and revoked_at is null
      and (expires_at is null or expires_at > now())
    order by created_at desc
    limit 1;

    if existing_token is not null then
      return existing_token;
    end if;
  end if;

  next_token := encode(gen_random_bytes(18), 'hex');

  insert into public.workspace_share_links (workspace_id, role, token, created_by)
  values (workspace_id_input, link_role_input, next_token, auth.uid());

  return next_token;
end;
$$;

create or replace function public.redeem_workspace_share_link(token_input text)
returns table (workspace_id uuid, role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  link_row public.workspace_share_links%rowtype;
  existing_role text;
  resolved_role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into link_row
  from public.workspace_share_links
  where token = token_input
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;

  if link_row.id is null then
    raise exception 'Share link is invalid or expired';
  end if;

  select role into existing_role
  from public.workspace_members
  where workspace_id = link_row.workspace_id
    and user_id = auth.uid();

  if existing_role is null then
    insert into public.workspace_members (workspace_id, user_id, role)
    values (link_row.workspace_id, auth.uid(), link_row.role);
    resolved_role := link_row.role;
  elsif public.workspace_role_rank(link_row.role) > public.workspace_role_rank(existing_role) then
    update public.workspace_members
    set role = link_row.role
    where workspace_id = link_row.workspace_id
      and user_id = auth.uid();
    resolved_role := link_row.role;
  else
    resolved_role := existing_role;
  end if;

  return query
  select link_row.workspace_id, resolved_role;
end;
$$;

grant execute on function public.join_workspace_by_invite(text) to authenticated;
grant execute on function public.ensure_workspace_share_link(uuid, text, boolean) to authenticated;
grant execute on function public.redeem_workspace_share_link(text) to authenticated;

-- 5. Refresh RLS policies
drop policy if exists "Workspaces viewable by members" on public.workspaces;
drop policy if exists "Workspace owner can update" on public.workspaces;
drop policy if exists "Anyone can create workspace" on public.workspaces;

create policy "Workspaces viewable by members" on public.workspaces for select
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspaces.id
        and wm.user_id = auth.uid()
    )
  );

create policy "Workspace owner can update" on public.workspaces for update
  using (owner_id = auth.uid());

create policy "Anyone can create workspace" on public.workspaces for insert
  with check (owner_id = auth.uid());

drop policy if exists "Members can view co-members" on public.workspace_members;
drop policy if exists "Owner can manage members" on public.workspace_members;
drop policy if exists "Members can leave" on public.workspace_members;
drop policy if exists "Owners can add members" on public.workspace_members;
drop policy if exists "Owners can update member roles" on public.workspace_members;
drop policy if exists "Owners can remove members and members can leave" on public.workspace_members;

create policy "Members can view co-members" on public.workspace_members for select
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_members.workspace_id
        and wm.user_id = auth.uid()
    )
  );

create policy "Owners can add members" on public.workspace_members for insert
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_members.workspace_id
        and wm.user_id = auth.uid()
        and wm.role = 'owner'
    )
  );

create policy "Owners can update member roles" on public.workspace_members for update
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_members.workspace_id
        and wm.user_id = auth.uid()
        and wm.role = 'owner'
    )
  )
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_members.workspace_id
        and wm.user_id = auth.uid()
        and wm.role = 'owner'
    )
  );

create policy "Owners can remove members and members can leave" on public.workspace_members for delete
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_members.workspace_id
        and wm.user_id = auth.uid()
        and wm.role = 'owner'
    )
  );

drop policy if exists "Owners can view share links" on public.workspace_share_links;
drop policy if exists "Owners can create share links" on public.workspace_share_links;
drop policy if exists "Owners can update share links" on public.workspace_share_links;
drop policy if exists "Owners can delete share links" on public.workspace_share_links;

create policy "Owners can view share links" on public.workspace_share_links for select
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_share_links.workspace_id
        and wm.user_id = auth.uid()
        and wm.role = 'owner'
    )
  );

create policy "Owners can create share links" on public.workspace_share_links for insert
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_share_links.workspace_id
        and wm.user_id = auth.uid()
        and wm.role = 'owner'
    )
  );

create policy "Owners can update share links" on public.workspace_share_links for update
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_share_links.workspace_id
        and wm.user_id = auth.uid()
        and wm.role = 'owner'
    )
  );

create policy "Owners can delete share links" on public.workspace_share_links for delete
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_share_links.workspace_id
        and wm.user_id = auth.uid()
        and wm.role = 'owner'
    )
  );

drop policy if exists "Tasks viewable by workspace members" on public.tasks;
drop policy if exists "Members can add tasks" on public.tasks;
drop policy if exists "Only task owner can update" on public.tasks;
drop policy if exists "Only task owner can delete" on public.tasks;
drop policy if exists "Editors can add tasks" on public.tasks;
drop policy if exists "Editors can update tasks" on public.tasks;
drop policy if exists "Editors can delete tasks" on public.tasks;

create policy "Tasks viewable by workspace members" on public.tasks for select
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = tasks.workspace_id
        and wm.user_id = auth.uid()
    )
  );

create policy "Editors can add tasks" on public.tasks for insert
  with check (
    owner_id = auth.uid()
    and exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = tasks.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'editor')
    )
  );

create policy "Editors can update tasks" on public.tasks for update
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = tasks.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'editor')
    )
  );

create policy "Editors can delete tasks" on public.tasks for delete
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = tasks.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'editor')
    )
  );

-- 6. Realtime + indexes
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
end $$;

create index if not exists idx_tasks_workspace on public.tasks(workspace_id);
create index if not exists idx_tasks_owner on public.tasks(owner_id);
create index if not exists idx_tasks_group on public.tasks(group_id);
create index if not exists idx_workspace_members_user on public.workspace_members(user_id);
create index if not exists idx_workspaces_invite on public.workspaces(invite_code);
create index if not exists idx_workspace_share_links_workspace on public.workspace_share_links(workspace_id);
create index if not exists idx_workspace_share_links_token on public.workspace_share_links(token);
