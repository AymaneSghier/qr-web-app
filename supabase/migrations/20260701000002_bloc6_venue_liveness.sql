-- Bloc 6 — Venue liveness (BEHAVIORAL migration: it changes check_in()).
-- Liveness was purely time + presence, with no way to stop off-hours entry: a
-- stale QR link could check anyone in any afternoon. `is_live` gates *entry*
-- while the 06:00 cron keeps guaranteeing *cleanup* — two mechanisms, two roles.
-- The admin dashboard is the start/stop switch. Announce before applying (it
-- changes check_in for the other founder) and merge the PR promptly.

-- ---------------------------------------------------------------------------
-- 1. venues.is_live — a venue only accepts check-ins while a founder has it live.
--    Defaults false (a new venue is dark until started). Seed venues go live so
--    the existing dev room flow keeps working.
-- ---------------------------------------------------------------------------
alter table public.venues
  add column if not exists is_live boolean not null default false;

update public.venues set is_live = true where slug in ('paris-test', 'nyc-test');

-- ---------------------------------------------------------------------------
-- 2. check_in(venue) — now refuses when the venue is not live. Everything else
--    is unchanged (one room at a time, idempotent, doubles as the heartbeat).
--    Still SECURITY INVOKER: it only touches the caller's own presence rows.
-- ---------------------------------------------------------------------------
create or replace function public.check_in(p_venue_id uuid)
  returns public.presence
  language plpgsql
  security invoker
  set search_path = public
as $$
declare
  me uuid := (select auth.uid());
  v_live boolean;
  result public.presence;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;

  -- Gate entry on liveness: a dark venue (off-hours, not started, or self-closed
  -- by the rollover) rejects check-ins outright.
  select is_live into v_live from public.venues where id = p_venue_id;
  if not coalesce(v_live, false) then
    raise exception 'venue not live';
  end if;

  -- One room at a time: leave any active presence in a different venue.
  update public.presence
    set left_at = now()
    where profile_id = me and left_at is null and venue_id <> p_venue_id;

  -- Already here? bump the heartbeat. Otherwise check in fresh.
  update public.presence
    set last_seen_at = now()
    where profile_id = me and left_at is null and venue_id = p_venue_id
    returning * into result;

  if not found then
    insert into public.presence (profile_id, venue_id)
      values (me, p_venue_id)
      returning * into result;
  end if;

  return result;
end;
$$;

revoke execute on function public.check_in(uuid) from anon, public;
grant  execute on function public.check_in(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Venue creation by founders. Admins may INSERT venues (dark by default);
--    everyone can already SELECT venues. is_live is never toggled by a direct
--    UPDATE — it only moves through set_venue_live() below, so stopping always
--    empties the room atomically.
-- ---------------------------------------------------------------------------
grant insert on public.venues to authenticated;

create policy venues_insert_admin on public.venues
  for insert to authenticated with check (private.is_admin());

-- ---------------------------------------------------------------------------
-- 4. set_venue_live(venue, live) — the start/stop switch. Stop must close other
--    users' presence, so this is SECURITY DEFINER (a founder cannot UPDATE
--    another user's presence row directly) and self-guards on is_admin().
--      start → is_live = true.
--      stop  → is_live = false AND close every open presence in the venue.
-- ---------------------------------------------------------------------------
create or replace function public.set_venue_live(p_venue_id uuid, p_live boolean)
  returns public.venues
  language plpgsql
  security definer
  set search_path = public, private
as $$
declare
  result public.venues;
begin
  if not private.is_admin() then
    raise exception 'not authorized';
  end if;

  update public.venues set is_live = p_live where id = p_venue_id
    returning * into result;

  if not found then
    raise exception 'venue not found';
  end if;

  -- Stopping empties the room: close every still-open presence in this venue.
  if not p_live then
    update public.presence
      set left_at = now()
      where venue_id = p_venue_id and left_at is null;
  end if;

  return result;
end;
$$;

revoke execute on function public.set_venue_live(uuid, boolean) from anon, public;
grant  execute on function public.set_venue_live(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Cron self-close. The 06:00 rollover already closes presence and deletes
--    expired matches; it now also flips is_live=false for a venue whose night is
--    truly over, so a founder who forgets to press Stop does not leave it live.
--    Guard against closing a still-running venue: a venue self-closes only if it
--    has no active presence AND no check-in whose night is still ongoing AND it
--    had at least one check-in (a night actually happened). A just-started, still
--    empty venue therefore stays live.
-- ---------------------------------------------------------------------------
create or replace function public.close_ended_nights()
  returns integer
  language plpgsql
  security definer
  set search_path = public, private
as $$
declare
  closed_presence integer;
  deleted_matches integer;
  closed_venues integer;
begin
  update public.presence p
    set left_at = now()
    from public.venues v
    where p.venue_id = v.id
      and p.left_at is null
      and now() >= private.night_ends_at(p.checked_in_at, v.timezone);
  get diagnostics closed_presence = row_count;

  delete from public.matches m
    where m.expires_at <= now();
  get diagnostics deleted_matches = row_count;

  update public.venues v
    set is_live = false
    where v.is_live
      and not exists (
        select 1 from public.presence p
        where p.venue_id = v.id and p.left_at is null
      )
      and not exists (
        select 1 from public.presence p
        where p.venue_id = v.id
          and now() < private.night_ends_at(p.checked_in_at, v.timezone)
      )
      and exists (
        select 1 from public.presence p
        where p.venue_id = v.id
      );
  get diagnostics closed_venues = row_count;

  return closed_presence + deleted_matches + closed_venues;
end;
$$;

revoke execute on function public.close_ended_nights() from anon, authenticated, public;
