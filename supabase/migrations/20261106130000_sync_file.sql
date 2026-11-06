-- File del sync dei propri dati (allegati, immagini e PDF delle note, file delle raccolte): bucket privato
-- "sync-files", ognuno solo nella propria cartella <user_id>/… (src/core/cloud/syncFilesApi.ts). Come per sync_records,
-- mai visibili ad altri, nemmeno ai compagni di gruppo. Il client cancella i suoi file prima di eliminare l'account.

insert into storage.buckets (id, name, public, file_size_limit)
values ('sync-files', 'sync-files', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create policy "sync-files: leggere solo i propri" on storage.objects
  for select to authenticated
  using (bucket_id = 'sync-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "sync-files: caricare solo nei propri" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'sync-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "sync-files: sostituire solo i propri" on storage.objects
  for update to authenticated
  using (bucket_id = 'sync-files' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'sync-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "sync-files: cancellare solo i propri" on storage.objects
  for delete to authenticated
  using (bucket_id = 'sync-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
