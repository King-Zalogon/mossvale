-- Owner-managed, revocable bearer tokens for the read-only feedback MCP API.
-- Tokens are issued only from an authenticated owner session. The plaintext
-- token is shown once; this table stores its SHA-256 digest only.
create table if not exists public.mossvale_mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 40),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists mossvale_mcp_tokens_active_idx on public.mossvale_mcp_tokens(user_id, created_at desc) where revoked_at is null;
alter table public.mossvale_mcp_tokens enable row level security;
revoke all on public.mossvale_mcp_tokens from public, anon, authenticated;

create or replace function public.mossvale_mcp_require_owner()
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid;
begin
  actor := auth.uid();
  if actor is null then raise exception 'sign_in_required' using errcode = '42501'; end if;
  perform public.mossvale_require_access();
  if not public.is_portal_owner() then raise exception 'owner_required' using errcode = '42501'; end if;
  return actor;
end;
$$;
revoke all on function public.mossvale_mcp_require_owner() from public;

create or replace function public.mossvale_mcp_create_token(p_token_hash text, p_label text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid; active_count integer; created public.mossvale_mcp_tokens;
begin
  actor := public.mossvale_mcp_require_owner();
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_label is null or char_length(btrim(p_label)) not between 1 and 40 then
    raise exception 'invalid_mcp_token' using errcode = '22023';
  end if;
  select count(*) into active_count from public.mossvale_mcp_tokens where user_id = actor and revoked_at is null;
  if active_count >= 10 then raise exception 'mcp_token_limit' using errcode = 'P0001'; end if;
  insert into public.mossvale_mcp_tokens(user_id, label, token_hash)
  values (actor, btrim(p_label), p_token_hash)
  returning * into created;
  return jsonb_build_object('id', created.id, 'label', created.label, 'createdAt', created.created_at);
end;
$$;

create or replace function public.mossvale_mcp_list_tokens()
returns table(id uuid, label text, created_at timestamptz, last_used_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare actor uuid;
begin
  actor := public.mossvale_mcp_require_owner();
  return query
    select t.id, t.label, t.created_at, t.last_used_at
    from public.mossvale_mcp_tokens t
    where t.user_id = actor and t.revoked_at is null
    order by t.created_at desc, t.id;
end;
$$;

create or replace function public.mossvale_mcp_revoke_token(p_token_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor uuid; changed integer;
begin
  actor := public.mossvale_mcp_require_owner();
  if p_token_id is null then raise exception 'invalid_mcp_token' using errcode = '22023'; end if;
  update public.mossvale_mcp_tokens
  set revoked_at = coalesce(revoked_at, now())
  where id = p_token_id and user_id = actor and revoked_at is null;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

-- MCP bearer tokens are high-entropy, one-purpose credentials. These two
-- functions accept only their SHA-256 digest and expose only pending feedback.
create or replace function public.mossvale_mcp_authorize(p_token_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare token_id uuid;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  update public.mossvale_mcp_tokens t
  set last_used_at = now()
  where t.token_hash = p_token_hash and t.revoked_at is null
    and exists (
      select 1 from public.portal_profiles p
      where p.user_id = t.user_id and p.role = 'owner'
    )
    and exists (select 1 from public.applications a where a.slug = 'mossvale' and a.is_enabled)
  returning t.id into token_id;
  return token_id is not null;
end;
$$;

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

revoke all on function public.mossvale_mcp_create_token(text,text) from public, anon;
revoke all on function public.mossvale_mcp_list_tokens() from public, anon;
revoke all on function public.mossvale_mcp_revoke_token(uuid) from public, anon;
revoke all on function public.mossvale_mcp_authorize(text) from public, authenticated;
revoke all on function public.mossvale_mcp_feedback_queue(text,integer,timestamptz,uuid) from public, authenticated;
grant execute on function public.mossvale_mcp_create_token(text,text), public.mossvale_mcp_list_tokens(), public.mossvale_mcp_revoke_token(uuid) to authenticated;
grant execute on function public.mossvale_mcp_authorize(text), public.mossvale_mcp_feedback_queue(text,integer,timestamptz,uuid) to anon;
