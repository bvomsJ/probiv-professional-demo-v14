-- PROBIV Supabase schema v1. Apply once in Supabase SQL Editor.
-- Frontend uses only the publishable key. RLS is the security boundary.
create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum ('member','moderator','admin');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (char_length(username) between 3 and 24),
  role public.app_role not null default 'member',
  created_at timestamptz not null default now()
);

create table if not exists public.invites (
  code text primary key check (code ~ '^[A-Za-z0-9_-]{2,40}$'),
  active boolean not null default true,
  max_uses integer not null default 0 check (max_uses >= 0),
  uses integer not null default 0 check (uses >= 0),
  label text not null default ''
);

-- The current legacy UI has one large state object. This bridge preserves the UI while
-- replacing browser-only persistence with a server-backed JSON state. Do not put secrets in it.
create table if not exists public.app_state (
  id smallint primary key default 1 check (id = 1),
  state jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create or replace function public.current_app_role()
returns public.app_role language sql stable security definer
set search_path = public, pg_temp
as $$ select p.role from public.profiles p where p.id = auth.uid() limit 1 $$;

create or replace function public.is_app_admin()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select coalesce(public.current_app_role() = 'admin'::public.app_role, false) $$;

create or replace function public.create_profile_after_signup()
returns trigger language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare invite_code text; invite_row public.invites;
begin
  invite_code := coalesce(new.raw_user_meta_data->>'invite_code','');
  if invite_code = '' then raise exception 'A valid invitation code is required'; end if;
  select * into invite_row from public.invites where code = invite_code and active
    and (max_uses = 0 or uses < max_uses) for update;
  if not found then raise exception 'Invalid or exhausted invitation code'; end if;
  update public.invites set uses = uses + 1 where code = invite_code;
  insert into public.profiles(id, username, role)
    values (new.id, trim(new.raw_user_meta_data->>'username'), 'member');
  return new;
end $$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users
for each row execute function public.create_profile_after_signup();

alter table public.profiles enable row level security;
alter table public.invites enable row level security;
alter table public.app_state enable row level security;

drop policy if exists profiles_read_signed_in on public.profiles;
create policy profiles_read_signed_in on public.profiles for select to authenticated using (true);
drop policy if exists profiles_update_self_safe on public.profiles;
create policy profiles_update_self_safe on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = public.current_app_role());
drop policy if exists invites_admin_all on public.invites;
create policy invites_admin_all on public.invites for all to authenticated
  using (public.is_app_admin()) with check (public.is_app_admin());
drop policy if exists app_state_public_read on public.app_state;
create policy app_state_public_read on public.app_state for select to anon, authenticated using (true);
drop policy if exists app_state_admin_insert on public.app_state;
create policy app_state_admin_insert on public.app_state for insert to authenticated with check (public.is_app_admin());
drop policy if exists app_state_admin_update on public.app_state;
create policy app_state_admin_update on public.app_state for update to authenticated using (public.is_app_admin()) with check (public.is_app_admin());
drop policy if exists app_state_admin_delete on public.app_state;
create policy app_state_admin_delete on public.app_state for delete to authenticated using (public.is_app_admin());

grant select on public.app_state to anon, authenticated;
grant insert, update, delete on public.app_state to authenticated;
grant select on public.profiles to authenticated;
grant update (username) on public.profiles to authenticated;
grant select, insert, update, delete on public.invites to authenticated;
revoke all on function public.create_profile_after_signup() from public, anon, authenticated;
revoke all on function public.current_app_role() from public;
grant execute on function public.current_app_role() to authenticated;
revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to authenticated;

-- Bootstrap admin after signing up with an invite. Run manually, replacing the email:
-- update public.profiles p set role='admin' from auth.users u where p.id=u.id and u.email='YOUR_ADMIN_EMAIL';

create or replace function public.admin_replace_invites(p_invites jsonb)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
declare item jsonb;
begin
  if not public.is_app_admin() then raise exception 'admin role required'; end if;
  if jsonb_typeof(p_invites) <> 'array' then raise exception 'invites must be a JSON array'; end if;
  delete from public.invites;
  for item in select * from jsonb_array_elements(p_invites) loop
    insert into public.invites(code, label, active, max_uses, uses)
    values (item->>'code', coalesce(item->>'label',''), coalesce((item->>'active')::boolean,true),
      greatest(coalesce((item->>'maxUses')::integer,0),0), greatest(coalesce((item->>'uses')::integer,0),0));
  end loop;
end $$;
revoke all on function public.admin_replace_invites(jsonb) from public, anon;
grant execute on function public.admin_replace_invites(jsonb) to authenticated;
