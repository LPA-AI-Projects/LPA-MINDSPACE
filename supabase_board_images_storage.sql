-- Supabase Storage bucket for board images (required for live image sync).
-- Run once in Supabase SQL Editor, then confirm the bucket exists under Storage.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'board-images',
  'board-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "board_images_public_read" on storage.objects;
create policy "board_images_public_read"
on storage.objects for select
to public
using (bucket_id = 'board-images');

drop policy if exists "board_images_auth_insert" on storage.objects;
create policy "board_images_auth_insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'board-images');

drop policy if exists "board_images_auth_update" on storage.objects;
create policy "board_images_auth_update"
on storage.objects for update
to authenticated
using (bucket_id = 'board-images')
with check (bucket_id = 'board-images');

drop policy if exists "board_images_auth_delete" on storage.objects;
create policy "board_images_auth_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'board-images');
