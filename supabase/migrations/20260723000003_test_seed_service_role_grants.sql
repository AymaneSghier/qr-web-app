-- The test-venue seed runs outside PostgREST with the server-only service-role
-- key. Objects created by the MCP migration role do not inherit Supabase's
-- usual service_role privileges, so grant only the operations the seed uses.

grant select, insert, update on public.venues to service_role;
grant select, insert on public.profiles to service_role;
grant insert on public.profile_private to service_role;

grant insert, delete on public.presence to service_role;
grant insert, delete on public.likes to service_role;
grant delete on public.matches to service_role;
grant delete on public.reports to service_role;
grant delete on public.venue_ejections to service_role;
grant delete on public.venue_scan_events to service_role;
grant delete on public.venue_match_events to service_role;
grant delete on public.venue_chat_start_events to service_role;
grant delete on public.analytics_events to service_role;
grant delete on public.venue_conversation_events to service_role;
