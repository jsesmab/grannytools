create table public.profiles (
  id uuid primary key,
  display_name text not null default '',
  phone text,
  avatar_url text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.elders (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  care_mode text not null default 'autonomo',
  care_mode_at timestamptz not null default now(),
  snapshot jsonb not null default '{}'::jsonb,
  last_sync timestamptz,
  created_at timestamptz not null default now()
);
grant select on public.elders to authenticated;
grant all on public.elders to service_role;
alter table public.elders enable row level security;

create table public.elder_devices (
  device_id text primary key,
  elder_id uuid not null references public.elders(id) on delete cascade,
  secret_hash text not null,
  created_at timestamptz not null default now()
);
grant all on public.elder_devices to service_role;
alter table public.elder_devices enable row level security;

create table public.elder_invites (
  code text primary key,
  elder_id uuid not null references public.elders(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz
);
grant all on public.elder_invites to service_role;
alter table public.elder_invites enable row level security;

create table public.elder_members (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references public.elders(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'consulta' check (role in ('admin','consulta')),
  created_at timestamptz not null default now(),
  unique (elder_id, user_id)
);
grant select on public.elder_members to authenticated;
grant all on public.elder_members to service_role;
alter table public.elder_members enable row level security;

create or replace function public.is_elder_member(_elder uuid, _user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.elder_members where elder_id = _elder and user_id = _user)
$$;

create policy "own profile read" on public.profiles for select to authenticated
  using (id = auth.uid() or exists (
    select 1 from public.elder_members a join public.elder_members b on a.elder_id = b.elder_id
    where a.user_id = auth.uid() and b.user_id = profiles.id));
create policy "own profile insert" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid());

create policy "members read elders" on public.elders for select to authenticated
  using (public.is_elder_member(id, auth.uid()));
create policy "members read members" on public.elder_members for select to authenticated
  using (public.is_elder_member(elder_id, auth.uid()));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)), new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();