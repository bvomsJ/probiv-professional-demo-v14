-- PROBIV.CC — DRAFT Supabase schema for a future production version.
-- STATUS: NOT APPLIED and NOT TESTED against a live database. The current site is a static frontend demo
-- that stores everything in the visitor's browser (localStorage). Review before use.
-- Never put the service_role key in frontend code or in this repository; the frontend uses only the anon key
-- and every permission below is enforced by RLS on the server.

create extension if not exists pgcrypto;

create type public.app_role as enum ('guest_invite','member','moderator','admin');

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null unique check (char_length(name) between 3 and 24),
  role        public.app_role not null default 'member',
  status      text not null default 'Участник',
  avatar      text, color text check (color ~ '^#[0-9a-fA-F]{3,8}$'),
  bio         text not null default '',
  rating      integer not null default 0,
  joined_at   date not null default current_date,
  deleted_at  timestamptz
);

create table public.categories (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  description text not null default '',
  section     text not null default 'Основные разделы',
  closed      boolean not null default false,
  sort_order  integer not null default 0
);

create table public.threads (
  id          bigint generated always as identity primary key,
  category_id bigint not null references public.categories(id) on delete restrict,
  author_id   uuid references public.profiles(id) on delete set null,
  title       text not null check (char_length(title) between 3 and 200),
  pinned      boolean not null default false,
  invite_only boolean not null default false,
  views       integer not null default 0,
  created_at  timestamptz not null default now()
);
create index threads_category_idx on public.threads(category_id, created_at desc);

create table public.posts (
  id          bigint generated always as identity primary key,
  thread_id   bigint not null references public.threads(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null,
  body        text not null check (char_length(body) between 1 and 20000),
  created_at  timestamptz not null default now()
);
create index posts_thread_idx on public.posts(thread_id, created_at);

create table public.post_reactions (
  post_id bigint references public.posts(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  kind    text not null check (kind in ('like','dislike')),
  primary key (post_id, user_id)
);

create table public.invites (
  code text primary key check (code ~ '^[A-Za-z0-9_-]{2,40}$'),
  label text not null default '', active boolean not null default true,
  max_uses integer not null default 0, uses integer not null default 0
);

create table public.site_settings (key text primary key, value jsonb not null);   -- title, subtitle, footer, background, links, home labels
create table public.pages (slug text primary key, html text not null default '');  -- rules / help (sanitize on write AND on render)
create table public.media (id uuid primary key default gen_random_uuid(), storage_path text not null, name text, alt text, href text, enabled boolean not null default true);
create table public.ads (id bigint generated always as identity primary key, media_id uuid references public.media(id) on delete set null, position text not null, width int, height int, max_width int, align text, sort_order int default 0, enabled boolean not null default true);

-- ---------- helpers ----------
create or replace function public.is_staff() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('moderator','admin') and p.deleted_at is null) $$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.deleted_at is null) $$;

-- ---------- RLS ----------
alter table public.profiles       enable row level security;
alter table public.categories     enable row level security;
alter table public.threads        enable row level security;
alter table public.posts          enable row level security;
alter table public.post_reactions enable row level security;
alter table public.invites        enable row level security;
alter table public.site_settings  enable row level security;
alter table public.pages          enable row level security;
alter table public.media          enable row level security;
alter table public.ads            enable row level security;

-- public read of non-sensitive content
create policy categories_read on public.categories for select using (true);
create policy settings_read   on public.site_settings for select using (true);
create policy pages_read      on public.pages for select using (true);
create policy media_read      on public.media for select using (enabled or public.is_admin());
create policy ads_read        on public.ads for select using (enabled or public.is_admin());
-- profiles are members-only (matches the demo rule: profile pages require sign-in)
create policy profiles_read   on public.profiles for select to authenticated using (deleted_at is null or public.is_staff());
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));
-- threads/posts: invite-only content needs a signed-in member
create policy threads_read on public.threads for select using (not invite_only or auth.uid() is not null);
create policy posts_read   on public.posts   for select using (exists (select 1 from public.threads t where t.id = thread_id and (not t.invite_only or auth.uid() is not null)));
create policy threads_insert on public.threads for insert to authenticated with check (author_id = auth.uid());
create policy posts_insert   on public.posts   for insert to authenticated with check (author_id = auth.uid());
create policy posts_update_own_or_staff on public.posts for update to authenticated using (author_id = auth.uid() or public.is_staff());
create policy reactions_rw on public.post_reactions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- admin-only writes
create policy categories_admin on public.categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy settings_admin   on public.site_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy pages_admin      on public.pages for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy media_admin      on public.media for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy ads_admin        on public.ads for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy invites_admin    on public.invites for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy threads_staff_update on public.threads for update to authenticated using (public.is_staff());
create policy threads_staff_delete on public.threads for delete to authenticated using (public.is_staff());

-- Invite redemption must run server-side (RPC) so codes are never readable by clients:
create or replace function public.redeem_invite(p_code text) returns boolean language plpgsql security definer set search_path = public as $$
declare r public.invites;
begin
  select * into r from public.invites where code = p_code and active and (max_uses = 0 or uses < max_uses) for update;
  if not found then return false; end if;
  update public.invites set uses = uses + 1 where code = p_code;
  return true;
end $$;
revoke all on function public.redeem_invite(text) from public; grant execute on function public.redeem_invite(text) to anon, authenticated;
-- Storage: create a private bucket "media"; allow public read of enabled files via signed/public URLs, admin-only upload (storage policies).
