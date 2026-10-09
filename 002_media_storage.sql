-- Media uploads for the static GitHub Pages frontend.
-- Run once in Supabase SQL Editor after 001_schema.sql.

create table if not exists public.media (
  id text primary key,
  name text not null check (char_length(name) between 1 and 160),
  alt text not null default '',
  href text not null default '',
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp','image/gif','image/avif')),
  storage_path text not null unique,
  public_url text not null,
  enabled boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists media_enabled_created_at_idx
  on public.media (enabled, created_at desc);

alter table public.media enable row level security;

drop policy if exists media_public_read_enabled on public.media;
create policy media_public_read_enabled
  on public.media for select to anon, authenticated
  using (enabled = true);

drop policy if exists media_admin_read_all on public.media;
create policy media_admin_read_all
  on public.media for select to authenticated
  using (public.is_app_admin());

drop policy if exists media_admin_insert on public.media;
create policy media_admin_insert
  on public.media for insert to authenticated
  with check (public.is_app_admin() and created_by = auth.uid());

drop policy if exists media_admin_update on public.media;
create policy media_admin_update
  on public.media for update to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists media_admin_delete on public.media;
create policy media_admin_delete
  on public.media for delete to authenticated
  using (public.is_app_admin());

grant select on public.media to anon, authenticated;
grant insert, update, delete on public.media to authenticated;

-- Public reads are enabled for banner URLs; mutations still require an authenticated admin.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'probiv-media', 'probiv-media', true, 10485760,
  array['image/jpeg','image/png','image/webp','image/gif','image/avif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists probiv_media_admin_insert on storage.objects;
create policy probiv_media_admin_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'probiv-media' and public.is_app_admin());

drop policy if exists probiv_media_admin_update on storage.objects;
create policy probiv_media_admin_update
  on storage.objects for update to authenticated
  using (bucket_id = 'probiv-media' and public.is_app_admin())
  with check (bucket_id = 'probiv-media' and public.is_app_admin());

drop policy if exists probiv_media_admin_delete on storage.objects;
create policy probiv_media_admin_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'probiv-media' and public.is_app_admin());

-- No public INSERT/UPDATE/DELETE policy is created. The public bucket only exposes file reads.
