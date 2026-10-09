-- PROBIV hotfix: reliable upsert of topics, access flag and new topics.
-- Run after 003_secure_topics_and_persistence.sql. Safe to re-run.
create or replace function public.admin_save_site_state(p_state jsonb, p_threads jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item jsonb;
  topic_id bigint;
  access_value text;
begin
  if not public.is_app_admin() then
    raise exception 'Only an administrator can publish shared site changes';
  end if;
  if jsonb_typeof(coalesce(p_state, '{}'::jsonb)) <> 'object' then
    raise exception 'Site state must be a JSON object';
  end if;
  if jsonb_typeof(coalesce(p_threads, '[]'::jsonb)) <> 'array' then
    raise exception 'Threads must be a JSON array';
  end if;

  -- Validate every ID before changing any rows.
  for item in select value from jsonb_array_elements(coalesce(p_threads, '[]'::jsonb)) as x(value) loop
    if coalesce(item->>'id', '') !~ '^[0-9]+$' then
      raise exception 'Every topic must have a numeric id; invalid id: %', item->>'id';
    end if;
  end loop;

  insert into public.app_state(id, state, updated_at, updated_by)
  values (1, public.strip_private_topic_refs(p_state, p_threads), now(), auth.uid())
  on conflict (id) do update set
    state = excluded.state,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;

  -- Upsert each topic so existing rows update their access setting and new topics are inserted.
  for item in select value from jsonb_array_elements(coalesce(p_threads, '[]'::jsonb)) as x(value) loop
    topic_id := (item->>'id')::bigint;
    access_value := case when item->>'guestAccess' = 'invite' then 'invite' else 'public' end;
    insert into public.forum_threads(id, data, guest_access, updated_at, updated_by)
    values (topic_id, item, access_value, now(), auth.uid())
    on conflict (id) do update set
      data = excluded.data,
      guest_access = excluded.guest_access,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;
  end loop;

  -- Remove rows intentionally deleted in the admin UI. WHERE clause is explicit and scoped.
  delete from public.forum_threads ft
  where not exists (
    select 1
    from jsonb_array_elements(coalesce(p_threads, '[]'::jsonb)) as x(value)
    where (x.value->>'id') ~ '^[0-9]+$'
      and (x.value->>'id')::bigint = ft.id
  );
end;
$$;
revoke all on function public.admin_save_site_state(jsonb,jsonb) from public, anon;
grant execute on function public.admin_save_site_state(jsonb,jsonb) to authenticated;
