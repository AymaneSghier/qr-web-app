-- Presence: REPLICA IDENTITY FULL so realtime UPDATE payloads carry the old row.
--
-- Why: check_in() doubles as a heartbeat and bumps presence.last_seen_at every
-- ~2 minutes per phone. Every one of those UPDATEs reaches every client
-- subscribed to the venue's presence channel, and without the old row the
-- client cannot tell a pure heartbeat from a real room change (someone leaving
-- or toggling visibility) — so it refetched the whole room every time. At ~30
-- people that is a full candidates+count reload every few seconds on every
-- phone. With the old row available, the client skips UPDATEs where neither
-- left_at nor is_visible changed.
--
-- Cost: replication messages for presence carry the full old row. The table is
-- tiny (one active row per person per night), so this is negligible.
alter table public.presence replica identity full;

-- Venues join the realtime publication so the room's "the night hasn't started"
-- screen can open itself the instant a founder flips is_live (the client also
-- polls slowly as a fallback). Venues are world-readable already; this exposes
-- nothing new.
alter publication supabase_realtime add table public.venues;
