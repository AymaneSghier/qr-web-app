-- Bloc 3 — ephemeral chat.
-- Matches and their messages die with the venue night. Profiles remain
-- persistent; the match/chat is the forcing function to talk in person tonight.

-- ---------------------------------------------------------------------------
-- 1. Shared night-boundary helper. Given an instant and a venue timezone, return
--    the first local 06:00 strictly after the start of that user's bar night.
--    After-midnight check-ins/matches before 06:00 belong to the night ending
--    that same morning.
-- ---------------------------------------------------------------------------
create or replace function private.night_ends_at(p_at timestamptz, p_timezone text)
  returns timestamptz
  language plpgsql
  stable
  set search_path = public
as $$
declare
  local_at timestamp;
  local_end timestamp;
begin
  local_at := p_at at time zone p_timezone;

  if local_at < date_trunc('day', local_at) + interval '6 hours' then
    local_end := date_trunc('day', local_at) + interval '6 hours';
  else
    local_end := date_trunc('day', local_at) + interval '1 day' + interval '6 hours';
  end if;

  return local_end at time zone p_timezone;
end;
$$;

revoke execute on function private.night_ends_at(timestamptz, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Persist each match's expiry. This makes the night boundary explicit, lets
--    the UI hide expired matches, and lets the cron delete messages by deleting
--    expired matches (messages cascade).
-- ---------------------------------------------------------------------------
alter table public.matches
  add column if not exists expires_at timestamptz;

update public.matches m
  set expires_at = private.night_ends_at(m.created_at, v.timezone)
  from public.venues v
  where m.venue_id = v.id
    and m.expires_at is null;

alter table public.matches
  alter column expires_at set not null;

create index if not exists matches_by_expiry on public.matches (expires_at);

-- ---------------------------------------------------------------------------
-- 3. Create future matches with an expiry computed from the venue's timezone.
--    Users still cannot insert matches; this remains trigger-owned only.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_like()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, private
as $$
declare
  venue_timezone text;
begin
  if exists (
    select 1 from public.likes l
    where l.liker_id = new.liked_id
      and l.liked_id = new.liker_id
      and l.venue_id = new.venue_id
  ) then
    select v.timezone into venue_timezone
    from public.venues v
    where v.id = new.venue_id;

    insert into public.matches (profile_a, profile_b, venue_id, expires_at)
    values (
      least(new.liker_id, new.liked_id),
      greatest(new.liker_id, new.liked_id),
      new.venue_id,
      private.night_ends_at(now(), venue_timezone)
    )
    on conflict (profile_a, profile_b, venue_id) do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function public.handle_new_like() from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- 4. The existing pg_cron job keeps calling close_ended_nights(). Extend that
--    single in-database job to close active presence and delete expired matches.
--    Deleting matches deletes messages via ON DELETE CASCADE.
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

  return closed_presence + deleted_matches;
end;
$$;

revoke execute on function public.close_ended_nights() from anon, authenticated, public;
