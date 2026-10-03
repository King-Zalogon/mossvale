-- Disposable test database only: Supabase identity shim + minimal Zalonline contract.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth to public;
grant execute on function auth.uid() to public;
create extension pgcrypto;
create table public.portal_profiles (user_id uuid primary key references auth.users, role text not null default 'member');
create table public.applications (id uuid primary key default gen_random_uuid(), slug text unique, is_enabled boolean default true);
create table public.user_app_access (user_id uuid references auth.users, application_id uuid references public.applications, primary key(user_id, application_id));
create function public.is_portal_owner() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.portal_profiles where user_id = auth.uid() and role = 'owner');
$$;
create function public.can_access_application(target_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_portal_owner() or exists(select 1 from public.user_app_access where user_id = auth.uid() and application_id = target_id);
$$;
alter table public.applications enable row level security;
create policy "granted apps" on public.applications for select to authenticated using (is_enabled and public.can_access_application(id));
grant usage on schema public to authenticated, anon, service_role;
grant select on public.applications to authenticated;
insert into auth.users values ('00000000-0000-4000-8000-000000000001'), ('00000000-0000-4000-8000-000000000002'), ('00000000-0000-4000-8000-000000000003');
insert into public.portal_profiles(user_id) select id from auth.users;
insert into public.applications(slug) values ('mossvale');
insert into public.user_app_access select u.id, a.id from auth.users u cross join public.applications a where u.id <> '00000000-0000-4000-8000-000000000003';
