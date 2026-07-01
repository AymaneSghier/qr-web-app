-- Dev seed data. Not schema — safe to re-run (idempotent).
-- Stand-in venues for testing. `timezone` drives the nightly rollover that ends
-- the room at 06:00 local (see the bloc1_night_rollover migration). Replace with
-- the real Phase 1 venues later.

-- Dev venues ship live (is_live=true) so the local room flow works without
-- pressing Start in the admin dashboard first. Real venues are created dark.
insert into public.venues (slug, name, city, timezone, is_live) values
  ('paris-test', 'Paramour Test (Paris)', 'Paris',    'Europe/Paris',     true),
  ('nyc-test',   'Paramour Test (NYC)',   'New York', 'America/New_York', true)
on conflict (slug) do update set
  name = excluded.name,
  city = excluded.city,
  timezone = excluded.timezone,
  is_live = excluded.is_live;
