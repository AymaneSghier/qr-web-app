-- The analytics migration reintroduced the pre-night-scoping conflict target
-- after matches_unique had become (profile_a, profile_b, venue_id, expires_at).
-- Ordinary likes succeeded, but every reciprocal like failed before it could
-- create a match. Keep analytics while restoring the full matching invariants.

create or replace function public.handle_new_like()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, private
as $$
declare
  new_match_id uuid;
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
    on conflict (profile_a, profile_b, venue_id, expires_at) do nothing
    returning id into new_match_id;

    if new_match_id is not null then
      perform private.record_match_event(new_match_id);
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.handle_new_like() from anon, authenticated, public;
