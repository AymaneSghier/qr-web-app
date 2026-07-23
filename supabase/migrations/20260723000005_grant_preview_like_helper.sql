-- Track the completed-profile preview like path that already exists on the
-- shared development database, and repair its missing authenticated grant.
-- Keeping the helper + policy here makes the migration history replayable on a
-- fresh database instead of assuming the hand-applied helper already exists.

create or replace function private.can_like_preview_profile(
  p_liker_id uuid,
  p_liked_id uuid,
  p_venue_id uuid
)
  returns boolean
  language sql
  security definer
  stable
  set search_path = public
as $$
  select exists (
    select 1
    from public.venues v
    join public.presence liker_presence
      on liker_presence.venue_id = v.id
     and liker_presence.profile_id = p_liker_id
     and liker_presence.left_at is null
     and liker_presence.is_visible
    join public.profile_private liked_private
      on liked_private.id = p_liked_id
     and liked_private.adult_confirmed_at is not null
    where v.id = p_venue_id
      and v.is_live
      and v.profile_preview_enabled
      and p_liker_id <> p_liked_id
      and not exists (
        select 1
        from public.blocks b
        where (b.blocker_id = p_liker_id and b.blocked_id = p_liked_id)
           or (b.blocker_id = p_liked_id and b.blocked_id = p_liker_id)
      )
  )
$$;

revoke execute on function private.can_like_preview_profile(uuid, uuid, uuid)
  from public, anon;
grant execute on function private.can_like_preview_profile(uuid, uuid, uuid)
  to authenticated;

drop policy if exists likes_insert_own on public.likes;
create policy likes_insert_own on public.likes
  for insert to authenticated
  with check (
    liker_id = (select auth.uid())
    and (
      (
        exists (
          select 1 from public.presence p
          where p.profile_id = liker_id
            and p.venue_id = likes.venue_id
            and p.left_at is null
            and p.is_visible
        )
        and exists (
          select 1 from public.presence p
          where p.profile_id = liked_id
            and p.venue_id = likes.venue_id
            and p.left_at is null
            and p.is_visible
        )
        and not exists (
          select 1 from public.blocks b
          where (b.blocker_id = liker_id and b.blocked_id = liked_id)
             or (b.blocker_id = liked_id and b.blocked_id = liker_id)
        )
      )
      or private.can_like_preview_profile(liker_id, liked_id, venue_id)
    )
  );
