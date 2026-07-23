-- Permanent development rooms for repeatable room, waiting-state, and match
-- testing. Test-only behavior is explicit in the data model so a real venue can
-- never accidentally opt out of the nightly rollover.

alter table public.venues
  add column if not exists is_test_venue boolean not null default false,
  add column if not exists rollover_disabled boolean not null default false;

alter table public.venues
  add constraint venues_rollover_disabled_only_for_tests
  check (not rollover_disabled or is_test_venue);

comment on column public.venues.is_test_venue is
  'Development/QA venue. Excluded from founder analytics and never used for a real venue night.';
comment on column public.venues.rollover_disabled is
  'Keeps a test venue alive across the 06:00 rollover. May only be true when is_test_venue is true.';

insert into public.venues (
  slug,
  name,
  city,
  timezone,
  is_live,
  is_test_venue,
  rollover_disabled
)
values
  ('test-crowded', 'Test Lab · Crowded', 'Paris', 'Europe/Paris', true, true, true),
  ('test-empty', 'Test Lab · Empty', 'Paris', 'Europe/Paris', true, true, true)
on conflict (slug) do update set
  name = excluded.name,
  city = excluded.city,
  timezone = excluded.timezone,
  is_live = excluded.is_live,
  is_test_venue = excluded.is_test_venue,
  rollover_disabled = excluded.rollover_disabled
where public.venues.is_test_venue;

-- Likes on a rollover-exempt venue share a stable far-future night boundary.
-- Reciprocity compares expiry values exactly, so both the seeded pre-like and
-- the tester's later in-app like must receive the same value.
create or replace function public.set_like_expires_at()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, private
as $$
declare
  venue_timezone text;
  venue_rollover_disabled boolean;
begin
  if new.expires_at is not null then
    return new;
  end if;

  select v.timezone, v.rollover_disabled
    into venue_timezone, venue_rollover_disabled
  from public.venues v
  where v.id = new.venue_id;

  new.expires_at := case
    when venue_rollover_disabled then '9999-12-31 23:59:59.999+00'::timestamptz
    else private.night_ends_at(new.created_at, venue_timezone)
  end;
  return new;
end;
$$;

revoke execute on function public.set_like_expires_at() from anon, authenticated, public;

-- The rollover leaves every kind of ephemeral test-room state untouched. The
-- manual admin stop control remains available and still empties either room.
create or replace function public.close_ended_nights()
  returns integer
  language plpgsql
  security definer
  set search_path = public, private
as $$
declare
  closed_presence integer;
  deleted_likes integer;
  deleted_matches integer;
  closed_venues integer;
begin
  update public.presence p
    set left_at = now()
    from public.venues v
    where p.venue_id = v.id
      and not v.rollover_disabled
      and p.left_at is null
      and now() >= private.night_ends_at(p.checked_in_at, v.timezone);
  get diagnostics closed_presence = row_count;

  delete from public.likes l
    using public.venues v
    where l.venue_id = v.id
      and not v.rollover_disabled
      and l.expires_at <= now();
  get diagnostics deleted_likes = row_count;

  delete from public.matches m
    using public.venues v
    where m.venue_id = v.id
      and not v.rollover_disabled
      and m.expires_at <= now();
  get diagnostics deleted_matches = row_count;

  update public.venues v
    set is_live = false
    where v.is_live
      and not v.rollover_disabled
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

  return closed_presence + deleted_likes + deleted_matches + closed_venues;
end;
$$;

revoke execute on function public.close_ended_nights() from anon, authenticated, public;

-- Test scans must not affect cross-venue retention. Other test events may still
-- be captured for debugging, but the analytics wrapper below never returns a
-- test venue.
create or replace function public.record_venue_scan(p_venue_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public, private
as $$
declare
  me uuid := auth.uid();
  scan_night date;
  test_venue boolean;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;

  select
    (private.night_ends_at(now(), v.timezone))::date,
    v.is_test_venue
    into scan_night, test_venue
  from public.venues v
  where v.id = p_venue_id;

  if scan_night is null then
    raise exception 'venue not found';
  end if;

  if test_venue then
    return;
  end if;

  insert into public.venue_scan_events (user_id, venue_id, night)
  values (me, p_venue_id, scan_night)
  on conflict (user_id, venue_id, night)
  do update set last_seen_at = now();
end;
$$;

revoke execute on function public.record_venue_scan(uuid) from anon, public;
grant execute on function public.record_venue_scan(uuid) to authenticated;

-- Preserve the existing aggregate implementation privately, then expose the
-- same RPC contract with test venues filtered at the boundary.
alter function public.admin_founder_analytics() set schema private;
alter function private.admin_founder_analytics() rename to admin_founder_analytics_including_tests;
revoke execute on function private.admin_founder_analytics_including_tests()
  from anon, authenticated, public;

create function public.admin_founder_analytics()
  returns table (
    venue_id uuid,
    venue_name text,
    venue_city text,
    night date,
    scans integer,
    unique_scanners integer,
    landing_views integer,
    sessions integer,
    profiles_created integer,
    profile_completions integer,
    checkins integer,
    scan_checkins integer,
    venue_experience_openers integer,
    discovery_openers integer,
    profile_viewers integer,
    profile_views integer,
    chat_openers integer,
    chat_opens integer,
    conversations_started integer,
    first_message_senders integer,
    reciprocal_conversations integer,
    engaged_conversations integer,
    replied_conversations integer,
    returning_users integer,
    returning_same_venue_users integer,
    returning_other_venue_users integer,
    women_checkins integer,
    men_checkins integer,
    nonbinary_checkins integer,
    same_gender_interest_checkins integer,
    multi_gender_interest_checkins integer,
    interested_in_women_checkins integer,
    interested_in_men_checkins integer,
    interested_in_nonbinary_checkins integer,
    top_source text,
    top_medium text,
    top_campaign text,
    top_qr_code_id text,
    peak_scan_hour integer,
    peak_activity_hour integer
  )
  language plpgsql
  security definer
  set search_path = public, private
as $$
begin
  if not private.is_admin() then
    raise exception 'not authorized';
  end if;

  return query
    select analytics.*
    from private.admin_founder_analytics_including_tests() analytics
    join public.venues v on v.id = analytics.venue_id
    where not v.is_test_venue;
end;
$$;

revoke execute on function public.admin_founder_analytics() from anon, public;
grant execute on function public.admin_founder_analytics() to authenticated;
