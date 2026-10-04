-- Apply after Zalonline's supabase/schema.sql, in the SAME Supabase project.
-- No browser/service key may bypass these functions' identity, quota or revision checks.
create table if not exists public.mossvale_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  message text not null check (char_length(btrim(message)) between 1 and 2000),
  pack_id text not null check (pack_id ~ '^[a-z0-9][a-z0-9_-]{0,99}$'),
  map_id text check (map_id is null or map_id ~ '^[a-z0-9][a-z0-9_-]{0,99}$'),
  build text check (build is null or char_length(build) <= 100),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  review_note text,
  unique (user_id, request_id)
);
create index if not exists mossvale_feedback_pending_idx on public.mossvale_feedback(created_at) where reviewed_at is null;
create index if not exists mossvale_feedback_quota_idx on public.mossvale_feedback(user_id, created_at);
alter table public.mossvale_feedback enable row level security;
drop policy if exists "read own feedback or portal owner" on public.mossvale_feedback;
create policy "read own feedback or portal owner" on public.mossvale_feedback for select to authenticated
  using (user_id = (select auth.uid()) or public.is_portal_owner());
revoke all on public.mossvale_feedback from anon, authenticated;
grant select on public.mossvale_feedback to authenticated;
grant all on public.mossvale_feedback to service_role;

create or replace function public.mossvale_require_access()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'sign_in_required' using errcode = '42501'; end if;
  if not exists (select 1 from public.applications a where a.slug = 'mossvale' and a.is_enabled and public.can_access_application(a.id)) then
    raise exception 'access_denied' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.mossvale_require_access() from public;

create or replace function public.mossvale_feedback_status()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare used integer; reset_at timestamptz;
begin
  perform public.mossvale_require_access();
  reset_at := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC' + interval '1 day';
  select count(*) into used from public.mossvale_feedback where user_id = auth.uid() and created_at >= reset_at - interval '1 day';
  return jsonb_build_object('remaining', greatest(0, 10 - used), 'dailyLimit', 10, 'maxCharacters', 2000, 'resetsAt', reset_at);
end;
$$;

create or replace function public.mossvale_submit_feedback(p_request_id uuid, p_message text, p_pack_id text, p_map_id text default null, p_build text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare existing public.mossvale_feedback; inserted public.mossvale_feedback; quota jsonb;
begin
  perform public.mossvale_require_access();
  if p_request_id is null or p_message is null or char_length(btrim(p_message)) not between 1 and 2000
    or p_pack_id is null or p_pack_id !~ '^[a-z0-9][a-z0-9_-]{0,99}$'
    or (p_map_id is not null and p_map_id !~ '^[a-z0-9][a-z0-9_-]{0,99}$')
    or char_length(p_build) > 100 then raise exception 'invalid_feedback' using errcode = '22023'; end if;
  -- Concurrent submissions from several tabs/devices share one per-user transaction lock.
  perform pg_advisory_xact_lock(hashtextextended('mossvale-feedback:' || auth.uid()::text, 0));
  select * into existing from public.mossvale_feedback where user_id = auth.uid() and request_id = p_request_id;
  if existing.id is not null then
    if existing.message <> btrim(p_message) or existing.pack_id <> p_pack_id or existing.map_id is distinct from p_map_id or existing.build is distinct from p_build then
      raise exception 'request_conflict' using errcode = '22023';
    end if;
    return public.mossvale_feedback_status() || jsonb_build_object('id', existing.id, 'createdAt', existing.created_at);
  end if;
  quota := public.mossvale_feedback_status();
  if (quota->>'remaining')::integer <= 0 then raise exception 'daily_limit' using errcode = 'P0001'; end if;
  insert into public.mossvale_feedback(user_id, request_id, message, pack_id, map_id, build)
  values (auth.uid(), p_request_id, btrim(p_message), p_pack_id, p_map_id, p_build) returning * into inserted;
  return public.mossvale_feedback_status() || jsonb_build_object('id', inserted.id, 'createdAt', inserted.created_at);
end;
$$;
revoke all on function public.mossvale_feedback_status() from public;
revoke all on function public.mossvale_submit_feedback(uuid,text,text,text,text) from public;
grant execute on function public.mossvale_feedback_status(), public.mossvale_submit_feedback(uuid,text,text,text,text) to authenticated;

create table if not exists public.mossvale_account_saves (
  user_id uuid not null references auth.users(id) on delete cascade,
  pack_id text not null check (pack_id ~ '^[a-z0-9][a-z0-9_-]{0,99}$'),
  backup jsonb not null check (octet_length(backup::text) <= 1000000),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, pack_id)
);
alter table public.mossvale_account_saves enable row level security;
drop policy if exists "read only own account saves" on public.mossvale_account_saves;
create policy "read only own account saves" on public.mossvale_account_saves for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.mossvale_account_saves from anon, authenticated;
grant select on public.mossvale_account_saves to authenticated;

create or replace function public.mossvale_store_save(p_pack_id text, p_backup jsonb, p_revision bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_revision bigint; updated public.mossvale_account_saves;
begin
  perform public.mossvale_require_access();
  if p_pack_id is null or p_pack_id !~ '^[a-z0-9][a-z0-9_-]{0,99}$' or p_revision is null or p_revision < 0
    or p_backup is null or octet_length(p_backup::text) > 1000000
    or (p_backup->>'kind') is distinct from 'mossvale-save-backup'
    or (p_backup->>'format') is distinct from '1'
    or jsonb_typeof(p_backup->'save') is distinct from 'object'
    or coalesce(p_backup->'save'->>'pack', 'mossvale') is distinct from p_pack_id then
    raise exception 'invalid_save' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('mossvale-save:' || auth.uid()::text || ':' || p_pack_id, 0));
  select revision into current_revision from public.mossvale_account_saves where user_id = auth.uid() and pack_id = p_pack_id;
  if coalesce(current_revision, 0) <> p_revision then raise exception 'save_conflict' using errcode = 'P0001'; end if;
  insert into public.mossvale_account_saves(user_id, pack_id, backup, revision) values(auth.uid(), p_pack_id, p_backup, 1)
  on conflict (user_id, pack_id) do update set backup = excluded.backup, revision = public.mossvale_account_saves.revision + 1, updated_at = now()
  returning * into updated;
  return jsonb_build_object('revision', updated.revision, 'updatedAt', updated.updated_at);
end;
$$;
revoke all on function public.mossvale_store_save(text,jsonb,bigint) from public;
grant execute on function public.mossvale_store_save(text,jsonb,bigint) to authenticated;

-- Durable review decisions. A single message may have several independently tracked findings.
create table if not exists public.mossvale_feedback_findings (
  feedback_id uuid not null references public.mossvale_feedback(id) on delete cascade,
  improvement_key text not null,
  decision jsonb not null,
  issue_number integer,
  updated_at timestamptz not null default now(),
  primary key (feedback_id, improvement_key)
);
alter table public.mossvale_feedback_findings enable row level security;
drop policy if exists "owners read feedback findings" on public.mossvale_feedback_findings;
create policy "owners read feedback findings" on public.mossvale_feedback_findings for select to authenticated using (public.is_portal_owner());
revoke all on public.mossvale_feedback_findings from anon, authenticated;
grant select on public.mossvale_feedback_findings to authenticated;
grant all on public.mossvale_feedback_findings to service_role;

-- A lease prevents overlapping manual/daily reviewers; crash recovery waits at most 20 minutes.
create table if not exists public.mossvale_review_lease (id integer primary key check (id = 1), token uuid, expires_at timestamptz);
alter table public.mossvale_review_lease enable row level security;
revoke all on public.mossvale_review_lease from public, anon, authenticated;
create or replace function public.mossvale_review_lock(p_token uuid, p_release boolean default false)
returns boolean language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  if p_token is null then return false; end if;
  insert into public.mossvale_review_lease(id) values (1) on conflict do nothing;
  if p_release then
    update public.mossvale_review_lease set token = null, expires_at = null where id = 1 and token = p_token;
  else
    update public.mossvale_review_lease set token = p_token, expires_at = now() + interval '20 minutes'
    where id = 1 and (token = p_token or expires_at is null or expires_at < now());
  end if;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;
revoke all on function public.mossvale_review_lock(uuid,boolean) from public, anon, authenticated;
grant execute on function public.mossvale_review_lock(uuid,boolean) to service_role;
