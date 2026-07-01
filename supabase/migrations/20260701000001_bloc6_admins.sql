-- Bloc 6 — Admin dashboard: founder allow-list and moderation visibility.
-- Access to /admin is founder-only, recognised at the database (not the client):
-- the DB treats every session identically, and an anonymous session cannot see
-- other users' reports. A small allow-list table plus RLS makes the two founders
-- privileged for the exact surfaces the dashboard needs — nothing more. The
-- service-role key is never used; RLS stays the rampart.

-- ---------------------------------------------------------------------------
-- 1. admins — the founder allow-list. Locked down: no policies and no grants to
--    `authenticated`, so it is unreadable/unwritable through PostgREST. Only the
--    SECURITY DEFINER helpers below (which bypass RLS) ever read it. Rows are
--    seeded out-of-band (the two founder auth.users ids).
-- ---------------------------------------------------------------------------
create table public.admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

comment on table public.admins is
  'Founder allow-list for the /admin dashboard. Read only via private.is_admin(); no direct API access.';

alter table public.admins enable row level security;

-- ---------------------------------------------------------------------------
-- 2. private.is_admin() — is the current user a founder? SECURITY DEFINER so it
--    can read public.admins (which no role may SELECT) without exposing it, and
--    in the `private` schema PostgREST does not expose (smallest callable surface).
--    Used inside RLS policies: because it bypasses RLS it never recurses.
-- ---------------------------------------------------------------------------
create or replace function private.is_admin()
  returns boolean
  language sql
  security definer
  stable
  set search_path = public
as $$
  select exists (
    select 1 from public.admins a
    where a.user_id = (select auth.uid())
  )
$$;

revoke execute on function private.is_admin() from public, anon;
grant  execute on function private.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. public.am_i_admin() — the client gate. The /admin page calls this to decide
--    whether to render the dashboard. Thin wrapper over the private helper; the
--    real enforcement is the RLS policies below, this is only for the UI.
-- ---------------------------------------------------------------------------
create or replace function public.am_i_admin()
  returns boolean
  language sql
  stable
  set search_path = public
as $$
  select private.is_admin()
$$;

revoke execute on function public.am_i_admin() from public, anon;
grant  execute on function public.am_i_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Moderation visibility. Admins may read every report and block (today they
--    land nowhere: reports/blocks SELECT is reporter/blocker-only). Added
--    alongside the existing owner policies — permissive policies OR together, so
--    a normal user still reads only their own, an admin reads all.
--    IMPORTANT: no admin policy on likes/matches/profile_private. Founders must
--    never read raw likes/matches (that is who-liked/matched-whom, the invariant
--    3 red line) nor email (profile_private stays owner-only). Aggregates come
--    from a counts-only RPC in a later migration.
-- ---------------------------------------------------------------------------
create policy reports_select_admin on public.reports
  for select to authenticated using (private.is_admin());

create policy blocks_select_admin on public.blocks
  for select to authenticated using (private.is_admin());

-- Profiles of the reporter/reported parties must be readable to render the queue.
create policy profiles_select_admin on public.profiles
  for select to authenticated using (private.is_admin());
