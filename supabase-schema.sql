-- Popdo Supabase Schema

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
  role text default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz default now(),
  primary key (workspace_id, user_id)
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
  created_at timestamptz default now()
);

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

-- RLS Policies
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.tasks enable row level security;

-- Profiles: read any, update own
create policy "Profiles are viewable by everyone" on public.profiles for select using (true);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

-- Workspaces: viewable if member
create policy "Workspaces viewable by members" on public.workspaces for select
  using (id in (select workspace_id from public.workspace_members where user_id = auth.uid()));
create policy "Workspace owner can update" on public.workspaces for update
  using (owner_id = auth.uid());
create policy "Anyone can create workspace" on public.workspaces for insert
  with check (owner_id = auth.uid());

-- Workspace members
create policy "Members can view co-members" on public.workspace_members for select
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));
create policy "Owner can manage members" on public.workspace_members for insert
  with check (true);  -- joining via invite code is handled in app logic
create policy "Members can leave" on public.workspace_members for delete
  using (user_id = auth.uid());

-- Tasks: viewable by workspace members, editable by owner only
create policy "Tasks viewable by workspace members" on public.tasks for select
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));
create policy "Members can add tasks" on public.tasks for insert
  with check (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
    and owner_id = auth.uid()
  );
create policy "Only task owner can update" on public.tasks for update
  using (owner_id = auth.uid());
create policy "Only task owner can delete" on public.tasks for delete
  using (owner_id = auth.uid());

-- Enable realtime for tasks
alter publication supabase_realtime add table public.tasks;

-- Indexes
create index idx_tasks_workspace on public.tasks(workspace_id);
create index idx_tasks_owner on public.tasks(owner_id);
create index idx_tasks_group on public.tasks(group_id);
create index idx_workspace_members_user on public.workspace_members(user_id);
create index idx_workspaces_invite on public.workspaces(invite_code);
