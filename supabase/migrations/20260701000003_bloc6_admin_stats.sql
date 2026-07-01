-- Bloc 6 — Admin aggregate stats. Founders see per-night/per-venue counts to
-- prove the spark, and NOTHING nominative: this returns counts only, never ids
-- or pairs. That is the structural guard for invariant 3 — there is deliberately
-- no admin SELECT on likes/matches, so the only way a founder can read those
-- tables is through this counts-only function.
--
-- Note on history: presence rows persist (left_at is set, never deleted), so
-- check-ins accumulate across nights. Likes, matches and messages are ephemeral
-- (the 06:00 cron deletes them), so for past nights those three columns read 0 —
-- the ephemeral metrics are effectively "tonight". That is by design; the numbers
-- that matter are watched live during a night.

create or replace function public.admin_night_stats()
  returns table (
    venue_id      uuid,
    venue_name    text,
    night         date,
    checkins      integer,
    likes         integer,
    matches       integer,
    chats_started integer
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
  with
  ci as (
    select p.venue_id as vid,
           (private.night_ends_at(p.checked_in_at, v.timezone))::date as night,
           count(*)::int as c
    from public.presence p
    join public.venues v on v.id = p.venue_id
    group by p.venue_id, (private.night_ends_at(p.checked_in_at, v.timezone))::date
  ),
  lk as (
    select l.venue_id as vid,
           (private.night_ends_at(l.created_at, v.timezone))::date as night,
           count(*)::int as c
    from public.likes l
    join public.venues v on v.id = l.venue_id
    group by l.venue_id, (private.night_ends_at(l.created_at, v.timezone))::date
  ),
  mt as (
    select m.venue_id as vid,
           (private.night_ends_at(m.created_at, v.timezone))::date as night,
           count(*)::int as c
    from public.matches m
    join public.venues v on v.id = m.venue_id
    group by m.venue_id, (private.night_ends_at(m.created_at, v.timezone))::date
  ),
  ch as (
    select m.venue_id as vid,
           (private.night_ends_at(m.created_at, v.timezone))::date as night,
           count(distinct msg.match_id)::int as c
    from public.messages msg
    join public.matches m on m.id = msg.match_id
    join public.venues v on v.id = m.venue_id
    group by m.venue_id, (private.night_ends_at(m.created_at, v.timezone))::date
  ),
  spine as (
    select vid, night from ci
    union select vid, night from lk
    union select vid, night from mt
    union select vid, night from ch
  )
  select s.vid,
         v.name,
         s.night,
         coalesce(ci.c, 0),
         coalesce(lk.c, 0),
         coalesce(mt.c, 0),
         coalesce(ch.c, 0)
  from spine s
  join public.venues v on v.id = s.vid
  left join ci on ci.vid = s.vid and ci.night = s.night
  left join lk on lk.vid = s.vid and lk.night = s.night
  left join mt on mt.vid = s.vid and mt.night = s.night
  left join ch on ch.vid = s.vid and ch.night = s.night
  order by s.night desc, v.name;
end;
$$;

revoke execute on function public.admin_night_stats() from anon, public;
grant  execute on function public.admin_night_stats() to authenticated;
