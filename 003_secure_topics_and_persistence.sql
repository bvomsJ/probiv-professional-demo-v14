-- PROBIV: secure topic bodies and make admin saves atomic.
-- Apply AFTER 001_schema.sql in the Supabase SQL Editor.
create table if not exists public.forum_threads (
  id bigint primary key,
  data jsonb not null,
  guest_access text not null default 'public' check (guest_access in ('public','invite')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

-- One-time migration of legacy topic JSON into row-level protected records.
insert into public.forum_threads(id, data, guest_access)
select
  (topic->>'id')::bigint,
  topic,
  case when topic->>'guestAccess' = 'invite' then 'invite' else 'public' end
from public.app_state s
cross join lateral jsonb_array_elements(coalesce(s.state->'threads','[]'::jsonb)) as x(topic)
where s.id = 1
  and coalesce(topic->>'id','') ~ '^[0-9]+$'
on conflict (id) do update set
  data = excluded.data,
  guest_access = excluded.guest_access,
  updated_at = now();

-- Also remove closed-topic titles from public recent/hot lists in the JSON state.
create or replace function public.strip_private_topic_refs(p_state jsonb, p_threads jsonb)
returns jsonb
language plpgsql immutable
set search_path = public, pg_temp
as $$
declare
  result_state jsonb := coalesce(p_state, '{}'::jsonb) - 'threads' - 'invites' - 'adminAuth';
  recent_rows jsonb;
  hot_rows jsonb;
begin
  select coalesce(jsonb_agg(entry), '[]'::jsonb) into recent_rows
  from jsonb_array_elements(coalesce(result_state->'recent','[]'::jsonb)) as x(entry)
  where not exists (
    select 1 from jsonb_array_elements(coalesce(p_threads,'[]'::jsonb)) as t(topic)
    where t.topic->>'guestAccess' = 'invite'
      and nullif(t.topic->>'title','') = entry->>'title'
  );
  if result_state ? 'recent' then result_state := jsonb_set(result_state, '{recent}', recent_rows, true); end if;

  select coalesce(jsonb_agg(entry), '[]'::jsonb) into hot_rows
  from jsonb_array_elements(coalesce(result_state->'hotTopics','[]'::jsonb)) as x(entry)
  where not exists (
    select 1 from jsonb_array_elements(coalesce(p_threads,'[]'::jsonb)) as t(topic)
    where t.topic->>'guestAccess' = 'invite'
      and nullif(t.topic->>'title','') = entry->>'title'
  );
  if result_state ? 'hotTopics' then result_state := jsonb_set(result_state, '{hotTopics}', hot_rows, true); end if;
  return result_state;
end;
$$;
revoke all on function public.strip_private_topic_refs(jsonb,jsonb) from public, anon, authenticated;

-- Crucial: remove all topic bodies/posts and closed-topic titles from the public JSON blob.
update public.app_state s
set state = public.strip_private_topic_refs(
  s.state,
  (select coalesce(jsonb_agg(ft.data), '[]'::jsonb) from public.forum_threads ft)
), updated_at = now()
where s.id = 1;

alter table public.forum_threads enable row level security;
drop policy if exists forum_threads_visible_read on public.forum_threads;
create policy forum_threads_visible_read on public.forum_threads
for select to anon, authenticated
using (
  guest_access = 'public'
  or public.is_app_admin()
  or (auth.uid() is not null and exists (select 1 from public.profiles p where p.id = auth.uid()))
);
drop policy if exists forum_threads_admin_write on public.forum_threads;
create policy forum_threads_admin_write on public.forum_threads
for all to authenticated
using (public.is_app_admin()) with check (public.is_app_admin());
grant select on public.forum_threads to anon, authenticated;
grant insert, update, delete on public.forum_threads to authenticated;

-- Single transaction: save all admin-managed site settings plus topic bodies/posts.
create or replace function public.admin_save_site_state(p_state jsonb, p_threads jsonb)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  item jsonb;
  topic_id bigint;
  access_value text;
begin
  if not public.is_app_admin() then
    raise exception 'Only an administrator can save shared site state';
  end if;
  if jsonb_typeof(coalesce(p_state, '{}'::jsonb)) <> 'object' then
    raise exception 'Site state must be a JSON object';
  end if;
  if jsonb_typeof(coalesce(p_threads, '[]'::jsonb)) <> 'array' then
    raise exception 'Threads must be a JSON array';
  end if;

  insert into public.app_state(id, state, updated_at, updated_by)
  values (1, public.strip_private_topic_refs(p_state, p_threads), now(), auth.uid())
  on conflict (id) do update set
    state = excluded.state,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;

  -- Replace the complete topic collection atomically. Nested posts remain protected with each topic row.
  delete from public.forum_threads;
  for item in select value from jsonb_array_elements(coalesce(p_threads, '[]'::jsonb)) as x(value) loop
    if coalesce(item->>'id','') !~ '^[0-9]+$' then
      raise exception 'Every topic must have a numeric id';
    end if;
    topic_id := (item->>'id')::bigint;
    access_value := case when item->>'guestAccess' = 'invite' then 'invite' else 'public' end;
    insert into public.forum_threads(id, data, guest_access, updated_at, updated_by)
    values (topic_id, item, access_value, now(), auth.uid());
  end loop;
end;
$$;
revoke all on function public.admin_save_site_state(jsonb,jsonb) from public, anon;
grant execute on function public.admin_save_site_state(jsonb,jsonb) to authenticated;

-- The old public JSON endpoint is safe only because topic bodies have been removed from it.
-- Keep read access for the existing public settings/pages UI; all writes go through the admin RPC.
