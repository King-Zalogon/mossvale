-- Extend the owner-token Mossvale feedback MCP with an auditable review status.
-- Apply in the shared Zalonline Supabase project after 20261004_feedback_mcp.sql.
alter table public.mossvale_feedback
  add column if not exists review_status text not null default 'new';

update public.mossvale_feedback set review_status = 'new' where review_status is null;
alter table public.mossvale_feedback alter column review_status set default 'new';
alter table public.mossvale_feedback alter column review_status set not null;
alter table public.mossvale_feedback drop constraint if exists mossvale_feedback_review_status_check;
alter table public.mossvale_feedback
  add constraint mossvale_feedback_review_status_check
  check (review_status in ('new', 'read', 'accepted', 'rejected', 'deferred'));
create index if not exists mossvale_feedback_mcp_status_idx
  on public.mossvale_feedback(review_status, created_at, id);

-- Append-only status history. MCP callers can neither read nor write this table;
-- the narrowly scoped security-definer RPC records verified actor/token data.
create table if not exists public.mossvale_feedback_status_events (
  id bigint generated always as identity primary key,
  feedback_id uuid not null references public.mossvale_feedback(id) on delete cascade,
  previous_status text not null check (previous_status in ('new', 'read', 'accepted', 'rejected', 'deferred')),
  new_status text not null check (new_status in ('new', 'read', 'accepted', 'rejected', 'deferred')),
  -- Store verified UUID snapshots without FKs so deleting an account/token does
  -- not erase or block retention of the audit trail.
  changed_by_user_id uuid not null,
  mcp_token_id uuid not null,
  mcp_token_label text not null check (char_length(btrim(mcp_token_label)) between 1 and 40),
  changed_at timestamptz not null default now()
);
create index if not exists mossvale_feedback_status_events_feedback_idx
  on public.mossvale_feedback_status_events(feedback_id, changed_at, id);
alter table public.mossvale_feedback_status_events enable row level security;
revoke all on public.mossvale_feedback_status_events from public, anon, authenticated, service_role;

-- Keep the original compatibility tool Mossvale-scoped as well.
create or replace function public.mossvale_mcp_feedback_queue(
  p_token_hash text,
  p_limit integer,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null
)
returns table(id uuid, message text, pack_id text, map_id text, build text, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or not exists (
      select 1 from public.mossvale_mcp_tokens t
      join public.portal_profiles p on p.user_id = t.user_id and p.role = 'owner'
      where t.token_hash = p_token_hash and t.revoked_at is null
    )
    or not exists (select 1 from public.applications a where a.slug = 'mossvale' and a.is_enabled) then
    raise exception 'mcp_unauthorized' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 51
    or ((p_cursor_created_at is null) <> (p_cursor_id is null)) then
    raise exception 'invalid_mcp_request' using errcode = '22023';
  end if;
  return query
    select f.id, f.message, f.pack_id, f.map_id, f.build, f.created_at
    from public.mossvale_feedback f
    where f.reviewed_at is null
      and (p_cursor_created_at is null or (f.created_at, f.id) > (p_cursor_created_at, p_cursor_id))
    order by f.created_at asc, f.id asc
    limit p_limit;
end;
$$;

create or replace function public.mossvale_mcp_feedback_list(
  p_token_hash text,
  p_limit integer,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_review_status text default null,
  p_map_id text default null,
  p_created_after timestamptz default null,
  p_created_before timestamptz default null
)
returns table(id uuid, message text, pack_id text, map_id text, build text, created_at timestamptz, review_status text)
language plpgsql security definer set search_path = '' as $$
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or not exists (
      select 1 from public.mossvale_mcp_tokens t
      join public.portal_profiles p on p.user_id = t.user_id and p.role = 'owner'
      where t.token_hash = p_token_hash and t.revoked_at is null
    )
    or not exists (select 1 from public.applications a where a.slug = 'mossvale' and a.is_enabled) then
    raise exception 'mcp_unauthorized' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 51
    or ((p_cursor_created_at is null) <> (p_cursor_id is null))
    or (p_review_status is not null and p_review_status not in ('new', 'read', 'accepted', 'rejected', 'deferred'))
    or (p_map_id is not null and (char_length(p_map_id) > 100 or p_map_id !~ '^[a-z0-9][a-z0-9_-]{0,99}$'))
    or (p_created_after is not null and p_created_before is not null and p_created_after > p_created_before) then
    raise exception 'invalid_mcp_request' using errcode = '22023';
  end if;
  return query
    select f.id, f.message, f.pack_id, f.map_id, f.build, f.created_at, f.review_status
    from public.mossvale_feedback f
    where (p_review_status is null or f.review_status = p_review_status)
      and (p_map_id is null or f.map_id = p_map_id)
      and (p_created_after is null or f.created_at >= p_created_after)
      and (p_created_before is null or f.created_at <= p_created_before)
      and (p_cursor_created_at is null or (f.created_at, f.id) > (p_cursor_created_at, p_cursor_id))
    order by f.created_at asc, f.id asc
    limit p_limit;
end;
$$;

create or replace function public.mossvale_mcp_feedback_get(p_token_hash text, p_feedback_id uuid)
returns table(id uuid, message text, pack_id text, map_id text, build text, created_at timestamptz, review_status text, status_changed_at timestamptz, status_changed_by text)
language plpgsql security definer set search_path = '' as $$
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or not exists (
      select 1 from public.mossvale_mcp_tokens t
      join public.portal_profiles p on p.user_id = t.user_id and p.role = 'owner'
      where t.token_hash = p_token_hash and t.revoked_at is null
    )
    or not exists (select 1 from public.applications a where a.slug = 'mossvale' and a.is_enabled) then
    raise exception 'mcp_unauthorized' using errcode = '42501';
  end if;
  if p_feedback_id is null then raise exception 'invalid_mcp_request' using errcode = '22023'; end if;
  return query
    select f.id, f.message, f.pack_id, f.map_id, f.build, f.created_at, f.review_status, latest.changed_at, latest.label
    from public.mossvale_feedback f
    left join lateral (
      select e.changed_at, e.mcp_token_label as label
      from public.mossvale_feedback_status_events e
      where e.feedback_id = f.id order by e.changed_at desc, e.id desc limit 1
    ) latest on true
    where f.id = p_feedback_id;
end;
$$;

create or replace function public.mossvale_mcp_feedback_set_status(
  p_token_hash text,
  p_feedback_id uuid,
  p_review_status text
)
returns table(id uuid, review_status text, changed_at timestamptz, changed_by text)
language plpgsql security definer set search_path = '' as $$
declare actor_id uuid; mcp_token_id uuid; token_label text; prior_status text; current_status text; event_time timestamptz; event_actor_label text;
begin
  select t.user_id, t.id, t.label into actor_id, mcp_token_id, token_label
  from public.mossvale_mcp_tokens t
  join public.portal_profiles p on p.user_id = t.user_id and p.role = 'owner'
  where t.token_hash = p_token_hash and t.revoked_at is null
    and exists (select 1 from public.applications a where a.slug = 'mossvale' and a.is_enabled);
  if actor_id is null then raise exception 'mcp_unauthorized' using errcode = '42501'; end if;
  if p_feedback_id is null or p_review_status is null
    or p_review_status not in ('new', 'read', 'accepted', 'rejected', 'deferred') then
    raise exception 'invalid_mcp_request' using errcode = '22023';
  end if;
  select f.review_status into prior_status
  from public.mossvale_feedback f
  where f.id = p_feedback_id
  for update;
  if not found then raise exception 'feedback_not_found' using errcode = 'P0002'; end if;
  if prior_status = p_review_status then
    select e.changed_at, e.mcp_token_label into event_time, event_actor_label from public.mossvale_feedback_status_events e
    where e.feedback_id = p_feedback_id order by e.changed_at desc, e.id desc limit 1;
    return query select p_feedback_id, prior_status, event_time, event_actor_label;
    return;
  end if;
  -- This is deliberately the only feedback column changed by this operation.
  update public.mossvale_feedback f set review_status = p_review_status
  where f.id = p_feedback_id
  returning f.review_status into current_status;
  insert into public.mossvale_feedback_status_events(
    feedback_id, previous_status, new_status, changed_by_user_id, mcp_token_id, mcp_token_label
  ) values (p_feedback_id, prior_status, current_status, actor_id, mcp_token_id, token_label)
  returning mossvale_feedback_status_events.changed_at into event_time;
  return query select p_feedback_id, current_status, event_time, token_label;
end;
$$;

revoke all on function public.mossvale_mcp_feedback_list(text,integer,timestamptz,uuid,text,text,timestamptz,timestamptz) from public, authenticated, service_role;
revoke all on function public.mossvale_mcp_feedback_get(text,uuid) from public, authenticated, service_role;
revoke all on function public.mossvale_mcp_feedback_set_status(text,uuid,text) from public, authenticated, service_role;
grant execute on function public.mossvale_mcp_feedback_list(text,integer,timestamptz,uuid,text,text,timestamptz,timestamptz),
  public.mossvale_mcp_feedback_get(text,uuid),
  public.mossvale_mcp_feedback_set_status(text,uuid,text) to anon;
