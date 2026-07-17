-- Venue profile preview: founder-controlled test override for cold-start rooms.
-- Default behavior remains live and in-room: users see mutually compatible
-- checked-in profiles. When this flag is enabled, a checked-in user whose
-- normal feed is empty can see completed public profiles so founders can test
-- the scroll experience without manufacturing active attendance.

alter table public.venues
  add column if not exists profile_preview_enabled boolean not null default false;

create or replace function public.set_venue_profile_preview(
  p_venue_id uuid,
  p_enabled boolean
)
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

  update public.venues
    set profile_preview_enabled = p_enabled
    where id = p_venue_id
    returning * into result;

  if not found then
    raise exception 'venue not found';
  end if;

  return result;
end;
$$;

revoke execute on function public.set_venue_profile_preview(uuid, boolean) from anon, public;
grant  execute on function public.set_venue_profile_preview(uuid, boolean) to authenticated;

create or replace function public.preview_room_profiles(p_venue_id uuid)
  returns table (
    id uuid,
    first_name text,
    photo_url text,
    bio text,
    gender text,
    interested_in text[],
    profile_created_at timestamptz
  )
  language plpgsql
  security definer
  stable
  set search_path = public, private
as $$
declare
  me uuid := (select auth.uid());
  preview_allowed boolean;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;

  select v.is_live
     and v.profile_preview_enabled
     and exists (
       select 1
       from public.presence p
       where p.profile_id = me
         and p.venue_id = p_venue_id
         and p.left_at is null
         and p.is_visible
     )
    into preview_allowed
  from public.venues v
  where v.id = p_venue_id;

  if not coalesce(preview_allowed, false) then
    return;
  end if;

  return query
    select
      pr.id,
      pr.first_name,
      pr.photo_url,
      pr.bio,
      pr.gender,
      pr.interested_in,
      pr.created_at
    from public.profiles pr
    join public.profile_private pp on pp.id = pr.id
    where pr.id <> me
      and pp.adult_confirmed_at is not null
      and not exists (
        select 1
        from public.blocks b
        where (b.blocker_id = me and b.blocked_id = pr.id)
           or (b.blocker_id = pr.id and b.blocked_id = me)
      )
    order by pr.created_at asc
    limit 50;
end;
$$;

revoke execute on function public.preview_room_profiles(uuid) from anon, public;
grant  execute on function public.preview_room_profiles(uuid) to authenticated;

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

  update public.venues
    set
      is_live = p_live,
      profile_preview_enabled = case
        when p_live then profile_preview_enabled
        else false
      end
    where id = p_venue_id
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
