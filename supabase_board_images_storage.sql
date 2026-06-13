-- Supabase Storage bucket for board images (required for live image sync).
-- Run once in Supabase SQL Editor, then confirm the bucket exists under Storage.

insert into storage.buckets (id, name, public)
values ('board-images', 'board-images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "board_images_public_read" on storage.objects;
create policy "board_images_public_read"
on storage.objects for select
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
using (bucket_id = 'board-images');

drop policy if exists "board_images_auth_delete" on storage.objects;
create policy "board_images_auth_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'board-images');
