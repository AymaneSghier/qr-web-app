-- Bloc 4 — Safety / women first.
-- V1 safety layer: declarative 18+ confirmation, balanced invisible mode,
-- strong blocks, and actionable reports. The database enforces the critical
-- boundaries; the UI is only the friendly path.

-- ---------------------------------------------------------------------------
-- 1. 18+ confirmation and balanced invisible mode.
-- ---------------------------------------------------------------------------
alter table public.profile_private
  add column if not exists adult_confirmed_at timestamptz;

alter table public.presence
  add column if not exists is_visible boolean not null default true;

create index if not exists presence_active_visible_by_venue
  on public.presence (venue_id) where left_at is null and is_visible;

-- ---------------------------------------------------------------------------
-- 2. Blocks and reports.
-- ---------------------------------------------------------------------------
create table public.blocks (
  id          uuid primary key default gen_random_uuid(),
  blocker_id  uuid not null references public.profiles (id) on delete cascade,
  blocked_id  uuid not null references public.profiles (id) on delete cascade,
  venue_id    uuid references public.venues (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint blocks_no_self check (blocker_id <> blocked_id),
  constraint blocks_unique_pair unique (blocker_id, blocked_id)
);

comment on table public.blocks is
  'User safety blocks. A block hides both profiles from each other and closes active interactions.';

create index blocks_blocked_lookup on public.blocks (blocked_id, blocker_id);

create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references public.profiles (id) on delete cascade,
  reported_id  uuid not null references public.profiles (id) on delete cascade,
  venue_id     uuid references public.venues (id) on delete set null,
  reason       text not null check (
                 reason in (
                   'harassment',
                   'fake_profile',
                   'underage',
                   'unsafe_behavior',
                   'other'
                 )
               ),
  note         text check (note is null or length(note) <= 500),
  created_at   timestamptz not null default now(),
  constraint reports_no_self check (reporter_id <> reported_id)
);

comment on table public.reports is
  'User safety reports. Users can create and read their own reports; moderation uses service-role access.';

create index reports_reported_lookup on public.reports (reported_id, created_at);

alter table public.blocks  enable row level security;
alter table public.reports enable row level security;

grant select, insert on public.blocks  to authenticated;
grant select, insert on public.reports to authenticated;

create policy blocks_select_own on public.blocks
  for select to authenticated using (blocker_id = (select auth.uid()));

create policy blocks_insert_own on public.blocks
  for insert to authenticated with check (blocker_id = (select auth.uid()));

create policy reports_select_own on public.reports
  for select to authenticated using (reporter_id = (select auth.uid()));

create policy reports_insert_own on public.reports
  for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = reporter_id and b.blocked_id = reported_id)
         or (b.blocker_id = reported_id and b.blocked_id = reporter_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 3. A block is a hard stop: remove stale likes and active matches/chats.
--    Messages cascade through matches. Users cannot delete matches directly.
-- ---------------------------------------------------------------------------
create or replace function public.close_interactions_after_block()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  delete from public.likes l
    where (l.liker_id = new.blocker_id and l.liked_id = new.blocked_id)
       or (l.liker_id = new.blocked_id and l.liked_id = new.blocker_id);

  delete from public.matches m
    where (
      m.profile_a = least(new.blocker_id, new.blocked_id)
      and m.profile_b = greatest(new.blocker_id, new.blocked_id)
    );

  return new;
end;
$$;

revoke execute on function public.close_interactions_after_block() from anon, authenticated, public;

drop trigger if exists blocks_close_interactions on public.blocks;
create trigger blocks_close_interactions
  after insert on public.blocks
  for each row execute function public.close_interactions_after_block();

-- ---------------------------------------------------------------------------
-- 4. Visibility helpers: invisible profiles and blocked pairs are not visible.
-- ---------------------------------------------------------------------------
create or replace function private.visible_profile_ids()
  returns setof uuid
  language sql
  security definer
  stable
  set search_path = public
as $$
  select (select auth.uid())
  union
  select theirs.profile_id
  from public.presence mine
  join public.presence theirs on theirs.venue_id = mine.venue_id
  where mine.profile_id = (select auth.uid())
    and mine.left_at is null
    and mine.is_visible
    and theirs.left_at is null
    and theirs.is_visible
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = mine.profile_id and b.blocked_id = theirs.profile_id)
         or (b.blocker_id = theirs.profile_id and b.blocked_id = mine.profile_id)
    )
  union
  select case
           when m.profile_a = (select auth.uid()) then m.profile_b
           else m.profile_a
         end
  from public.matches m
  where (select auth.uid()) in (m.profile_a, m.profile_b)
    and m.expires_at > now()
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = (select auth.uid()) and b.blocked_id in (m.profile_a, m.profile_b))
         or (b.blocked_id = (select auth.uid()) and b.blocker_id in (m.profile_a, m.profile_b))
    )
$$;

drop policy if exists presence_select_copresent on public.presence;
create policy presence_select_copresent on public.presence
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (
      venue_id in (select private.my_active_venue_ids())
      and left_at is null
      and is_visible
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = (select auth.uid()) and b.blocked_id = profile_id)
           or (b.blocked_id = (select auth.uid()) and b.blocker_id = profile_id)
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Likes/messages must respect visibility, blocks, and match expiry.
-- ---------------------------------------------------------------------------
drop policy if exists likes_insert_own on public.likes;
create policy likes_insert_own on public.likes
  for insert to authenticated
  with check (
    liker_id = (select auth.uid())
    and exists (
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
  );

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

drop policy if exists messages_select_member on public.messages;
create policy messages_select_member on public.messages
  for select to authenticated
  using (
    exists (
      select 1 from public.matches m
      where m.id = messages.match_id
        and m.expires_at > now()
        and (select auth.uid()) in (m.profile_a, m.profile_b)
        and not exists (
          select 1 from public.blocks b
          where (b.blocker_id = m.profile_a and b.blocked_id = m.profile_b)
             or (b.blocker_id = m.profile_b and b.blocked_id = m.profile_a)
        )
    )
  );

drop policy if exists messages_insert_member on public.messages;
create policy messages_insert_member on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.matches m
      where m.id = messages.match_id
        and m.expires_at > now()
        and (select auth.uid()) in (m.profile_a, m.profile_b)
        and not exists (
          select 1 from public.blocks b
          where (b.blocker_id = m.profile_a and b.blocked_id = m.profile_b)
             or (b.blocker_id = m.profile_b and b.blocked_id = m.profile_a)
        )
    )
  );
