-- Dev seed data. Not schema — safe to re-run (idempotent).
-- A stand-in venue so Bloc 2 (like/match) can be built and tested before Bloc 1
-- wires real QR check-in. Replace with the real Phase 1 venues later.

insert into public.venues (slug, name, city) values
  ('paris-test', 'Bartap Test (Paris)', 'Paris'),
  ('nyc-test',   'Bartap Test (NYC)',   'New York')
on conflict (slug) do nothing;
