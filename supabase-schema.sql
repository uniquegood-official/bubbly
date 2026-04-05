-- Bubbly Supabase Schema

-- Users profile (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text,
  avatar_url text,
  color text default '#7b5fcf',
  created_at timestamptz default now()
);

-- Workspaces (shareable boards)
create table public.workspaces (
  id uuid default gen_random_uuid() primary key,
  name text not null default 'My Board',
  owner_id uuid references public.profiles(id) on delete cascade not null,
  invite_code text unique default encode(gen_random_bytes(6), 'hex'),
  created_at timestamptz default now()
);

-- Workspace members
create table public.workspace_members (
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role text default 'viewer' check (role in ('owner', 'editor', 'viewer')),
  joined_at timestamptz default now(),
  primary key (workspace_id, user_id)
);

-- Share links
create table public.workspace_share_links (
  id uuid default gen_random_uuid() primary key,
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  role text not null check (role in ('viewer', 'editor')),
  token text unique not null default encode(gen_random_bytes(18), 'hex'),
  created_by uuid references public.profiles(id) on delete cascade not null,
  revoked_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz default now()
);

-- Tasks (bubbles)
create table public.tasks (
  id uuid default gen_random_uuid() primary key,
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  owner_id uuid references public.profiles(id) on delete set null,
  title text not null,
  priority smallint default 3 check (priority between 1 and 5),
  memo text,
  estimated_minutes int,
  due_date date,
  completed boolean default false,
  completed_at timestamptz,
  group_id uuid,
  color text,
  created_at timestamptz default now()
);

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

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Auto-create default workspace on profile creation
create or replace function public.handle_new_profile()
returns trigger as $$
declare
  ws_id uuid;
begin
  insert into public.workspaces (name, owner_id) values ('My Board', new.id) returning id into ws_id;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws_id, new.id, 'owner');
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_profile_created
  after insert on public.profiles
  for each row execute function public.handle_new_profile();

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

-- Helper functions (security definer = bypasses RLS, prevents recursion)
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

-- RLS Policies
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_share_links enable row level security;
alter table public.tasks enable row level security;

-- Profiles: read any, update own
create policy "Profiles are viewable by everyone" on public.profiles for select using (true);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

-- Workspaces: viewable if member
create policy "Workspaces viewable by members" on public.workspaces for select
  using (public.is_workspace_member(id));
create policy "Workspace owner can update" on public.workspaces for update
  using (owner_id = auth.uid());
create policy "Anyone can create workspace" on public.workspaces for insert
  with check (owner_id = auth.uid());

-- Workspace members (uses helper functions to avoid self-referencing recursion)
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

-- Share links
create policy "Owners can view share links" on public.workspace_share_links for select
  using (public.get_workspace_role(workspace_id) = 'owner');

create policy "Owners can create share links" on public.workspace_share_links for insert
  with check (public.get_workspace_role(workspace_id) = 'owner');

create policy "Owners can update share links" on public.workspace_share_links for update
  using (public.get_workspace_role(workspace_id) = 'owner');

create policy "Owners can delete share links" on public.workspace_share_links for delete
  using (public.get_workspace_role(workspace_id) = 'owner');

-- Tasks: viewable by workspace members, editable by owners/editors
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

-- Enable realtime for tasks
alter publication supabase_realtime add table public.tasks;

-- Indexes
create index idx_tasks_workspace on public.tasks(workspace_id);
create index idx_tasks_owner on public.tasks(owner_id);
create index idx_tasks_group on public.tasks(group_id);
create index idx_workspace_members_user on public.workspace_members(user_id);
create index idx_workspaces_invite on public.workspaces(invite_code);
create index idx_workspace_share_links_workspace on public.workspace_share_links(workspace_id);
create index idx_workspace_share_links_token on public.workspace_share_links(token);
