-- Bloc 0 — Foundations: table privileges for the `authenticated` role.
-- RLS restricts WHICH rows; a GRANT is the coarser table-level gate that must
-- also be present. Supabase's default-privilege grants did not apply to tables
-- created via the MCP migration role, so we grant explicitly. Anonymous sign-in
-- users carry the `authenticated` role, so that is the only role we grant to;
-- `anon` (no session) gets nothing, matching the `to authenticated` policies.
-- Grants are scoped to the operations each table's policies actually allow.

grant select, insert, update         on public.profiles        to authenticated;
grant select, insert, update, delete on public.profile_private to authenticated;
grant select                         on public.venues          to authenticated;
grant select, insert, update, delete on public.presence        to authenticated;
grant select, insert, delete         on public.likes           to authenticated;
grant select                         on public.matches         to authenticated;
grant select, insert                 on public.messages        to authenticated;
