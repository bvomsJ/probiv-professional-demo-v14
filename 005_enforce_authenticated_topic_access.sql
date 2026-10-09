-- Enforce access policy for topic bodies. Run after 004_fix_topic_upsert.sql.
-- Anonymous visitors can read only public topics; any real Supabase-authenticated user can read invite topics.
alter table public.forum_threads enable row level security;

drop policy if exists forum_threads_visible_read on public.forum_threads;
create policy forum_threads_visible_read
on public.forum_threads
for select to anon, authenticated
using (guest_access = 'public' or auth.uid() is not null);

-- Keep writes restricted to the verified Supabase admin.
drop policy if exists forum_threads_admin_write on public.forum_threads;
create policy forum_threads_admin_write
on public.forum_threads
for all to authenticated
using (public.is_app_admin())
with check (public.is_app_admin());

grant select on public.forum_threads to anon, authenticated;
grant insert, update, delete on public.forum_threads to authenticated;

-- Normalize the JSON access flag to the protected SQL column. The column is authoritative.
update public.forum_threads
set data = jsonb_set(coalesce(data, '{}'::jsonb), '{guestAccess}', to_jsonb(guest_access), true),
    updated_at = now();

-- Remove any stale topic bodies/references from the public JSON blob.
update public.app_state s
set state = public.strip_private_topic_refs(
  s.state,
  (select coalesce(jsonb_agg(ft.data), '[]'::jsonb) from public.forum_threads ft)
), updated_at = now()
where s.id = 1;
