-- 006: publish topic metadata in listings without exposing private topic bodies.
-- Run after migrations 003, 004 and 005.
create table if not exists public.forum_topic_index (
  id bigint primary key,
  title text not null default '',
  category text not null default '',
  author text not null default '',
  topic_date text not null default '',
  views bigint not null default 0,
  answers bigint not null default 0,
  pinned boolean not null default false,
  guest_access text not null default 'public' check (guest_access in ('public','invite')),
  updated_at timestamptz not null default now()
);

alter table public.forum_topic_index enable row level security;
drop policy if exists forum_topic_index_public_read on public.forum_topic_index;
create policy forum_topic_index_public_read
  on public.forum_topic_index for select to anon, authenticated using (true);
drop policy if exists forum_topic_index_admin_write on public.forum_topic_index;
create policy forum_topic_index_admin_write
  on public.forum_topic_index for all to authenticated
  using (public.is_app_admin()) with check (public.is_app_admin());
grant select on public.forum_topic_index to anon, authenticated;
grant insert, update, delete on public.forum_topic_index to authenticated;

create or replace function public.sync_forum_topic_index()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare d jsonb;
begin
  if tg_op = 'DELETE' then
    delete from public.forum_topic_index where id = old.id;
    return old;
  end if;
  d := coalesce(new.data, '{}'::jsonb);
  insert into public.forum_topic_index(
    id, title, category, author, topic_date, views, answers, pinned, guest_access, updated_at
  ) values (
    new.id,
    coalesce(d->>'title',''),
    coalesce(d->>'category',''),
    coalesce(d->>'author',''),
    coalesce(d->>'date',''),
    case when coalesce(d->>'views','') ~ '^[0-9]+$' then (d->>'views')::bigint else 0 end,
    case when coalesce(d->>'answers','') ~ '^[0-9]+$' then (d->>'answers')::bigint else 0 end,
    coalesce((d->>'pinned')::boolean, false),
    case when new.guest_access = 'invite' then 'invite' else 'public' end,
    now()
  )
  on conflict (id) do update set
    title=excluded.title, category=excluded.category, author=excluded.author,
    topic_date=excluded.topic_date, views=excluded.views, answers=excluded.answers,
    pinned=excluded.pinned, guest_access=excluded.guest_access, updated_at=now();
  return new;
end;
$$;
revoke all on function public.sync_forum_topic_index() from public, anon, authenticated;

drop trigger if exists forum_threads_sync_topic_index on public.forum_threads;
create trigger forum_threads_sync_topic_index
after insert or update of data, guest_access or delete on public.forum_threads
for each row execute function public.sync_forum_topic_index();

-- Backfill existing topics, including invite-only topics. Only metadata is exposed by this table.
insert into public.forum_topic_index(
  id, title, category, author, topic_date, views, answers, pinned, guest_access, updated_at
)
select
  ft.id,
  coalesce(ft.data->>'title',''),
  coalesce(ft.data->>'category',''),
  coalesce(ft.data->>'author',''),
  coalesce(ft.data->>'date',''),
  case when coalesce(ft.data->>'views','') ~ '^[0-9]+$' then (ft.data->>'views')::bigint else 0 end,
  case when coalesce(ft.data->>'answers','') ~ '^[0-9]+$' then (ft.data->>'answers')::bigint else 0 end,
  coalesce((ft.data->>'pinned')::boolean, false),
  case when ft.guest_access = 'invite' then 'invite' else 'public' end,
  now()
from public.forum_threads ft
on conflict (id) do update set
  title=excluded.title, category=excluded.category, author=excluded.author,
  topic_date=excluded.topic_date, views=excluded.views, answers=excluded.answers,
  pinned=excluded.pinned, guest_access=excluded.guest_access, updated_at=now();
