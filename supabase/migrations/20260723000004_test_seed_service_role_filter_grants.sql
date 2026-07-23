-- PostgREST requires SELECT on columns used to filter DELETE requests. Keep the
-- companion seed grants explicit rather than relying on default privileges.

grant select on
  public.presence,
  public.likes,
  public.matches,
  public.reports,
  public.venue_ejections,
  public.venue_scan_events,
  public.venue_match_events,
  public.venue_chat_start_events,
  public.analytics_events,
  public.venue_conversation_events
to service_role;
