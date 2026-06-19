-- Fix profile photo upload. The scaffold created the storage policies for the
-- `anon` role, but Supabase anonymous sign-in issues the `authenticated` role
-- (is_anonymous=true) — `anon` means no session at all. So once we sign in, the
-- upload was denied. Re-target the policies at `authenticated` and scope writes
-- to the user's own folder (filenames are `<uid>/...`), so no one can write over
-- another user's photo. Reads stay public via the public bucket's CDN endpoint,
-- which does not need a storage.objects SELECT policy — dropping the broad one
-- also clears the "public bucket allows listing" advisor.

drop policy if exists "Allow anonymous uploads to profile photos" on storage.objects;
drop policy if exists "Allow public reads from profile photos"   on storage.objects;

create policy "profile_photos_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "profile_photos_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
