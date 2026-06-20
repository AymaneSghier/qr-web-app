-- Expire likes with venue nights.
-- Likes are part of the ephemeral "tonight" state. Persisting them across
-- nights can make a user appear already liked or create a new-night match from
-- an old-night like.

-- ---------------------------------------------------------------------------
-- 1. Store each like's venue-night expiry and make likes unique per night.
-- ---------------------------------------------------------------------------
alter table public.likes
  add column if not exists expires_at timestamptz;

update public.likes l
  set expires_at = private.night_ends_at(l.created_at, v.timezone)
  from public.venues v
  where l.venue_id = v.id
    and l.expires_at is null;

alter table public.likes
  alter column expires_at set not null;

alter table public.likes
  drop constraint if exists likes_unique;

alter table public.likes
  add constraint likes_unique unique (liker_id, liked_id, venue_id, expires_at);

create index if not exists likes_by_expiry on public.likes (expires_at);

-- ---------------------------------------------------------------------------
-- 2. Match uniqueness should also be per venue night. The cron normally deletes
--    expired matches, but a delayed cleanup must not block a later-night match.
-- ---------------------------------------------------------------------------
alter table public.matches
  drop constraint if exists matches_unique;

alter table public.matches
  add constraint matches_unique unique (profile_a, profile_b, venue_id, expires_at);

-- ---------------------------------------------------------------------------
-- 3. New likes inherit the venue night's expiry before the match trigger runs.
-- ---------------------------------------------------------------------------
create or replace function public.set_like_expires_at()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, private
as $$
declare
  venue_timezone text;
begin
  if new.expires_at is not null then
    return new;
  end if;

  select v.timezone into venue_timezone
  from public.venues v
  where v.id = new.venue_id;

  new.expires_at := private.night_ends_at(new.created_at, venue_timezone);
  return new;
end;
$$;

revoke execute on function public.set_like_expires_at() from anon, authenticated, public;

drop trigger if exists likes_set_expires_at on public.likes;
create trigger likes_set_expires_at
  before insert on public.likes
  for each row execute function public.set_like_expires_at();

-- ---------------------------------------------------------------------------
-- 4. Reciprocal likes only create a match when both likes belong to the same
--    venue night. The match expires at the same boundary as the like.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_like()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, private
as $$
begin
  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = new.liker_id and b.blocked_id = new.liked_id)
       or (b.blocker_id = new.liked_id and b.blocked_id = new.liker_id)
  ) then
    return new;
  end if;

  if exists (
    select 1 from public.likes l
    where l.liker_id = new.liked_id
      and l.liked_id = new.liker_id
      and l.venue_id = new.venue_id
      and l.expires_at = new.expires_at
  ) then
    insert into public.matches (profile_a, profile_b, venue_id, expires_at)
    values (
      least(new.liker_id, new.liked_id),
      greatest(new.liker_id, new.liked_id),
      new.venue_id,
      new.expires_at
    )
    on conflict (profile_a, profile_b, venue_id, expires_at) do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function public.handle_new_like() from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- 5. The existing pg_cron job calls close_ended_nights(). Extend it to delete
--    expired likes alongside expired matches.
-- ---------------------------------------------------------------------------
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
begin
  update public.presence p
    set left_at = now()
    from public.venues v
    where p.venue_id = v.id
      and p.left_at is null
      and now() >= private.night_ends_at(p.checked_in_at, v.timezone);
  get diagnostics closed_presence = row_count;

  delete from public.likes l
    where l.expires_at <= now();
  get diagnostics deleted_likes = row_count;

  delete from public.matches m
    where m.expires_at <= now();
  get diagnostics deleted_matches = row_count;

  return closed_presence + deleted_likes + deleted_matches;
end;
$$;

revoke execute on function public.close_ended_nights() from anon, authenticated, public;
