-- File delle note mandate a un amico (PDF, immagini, allegati): bucket privato "friend-files"
-- (src/core/cloud/friendFilesApi.ts, docs/GRUPPI.md § Amici). Percorso <mittente>/<destinatario>/<lotto>/<nome>:
-- carica solo il mittente, e solo verso un amico; leggono e cancellano solo mittente e destinatario. I file restano
-- finché l'amico salva la nota (poi li cancella la sua app), al massimo 30 giorni (li cancella l'app di chi li ha
-- mandati o ricevuti). Al massimo 10 MB per file e 200 file per mittente, così un client modificato non riempie lo
-- spazio del progetto.

insert into storage.buckets (id, name, public, file_size_limit)
values ('friend-files', 'friend-files', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- Il percorso di un file dei messaggi diretti è giusto per chi carica: <me>/<amico>/<lotto uuid>/<nome>, e il
-- mittente ha ancora posto.
create function private.friend_file_upload_ok(p_name text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  parts text[] := storage.foldername(p_name);
  uuid_re text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if uid is null or coalesce(pg_catalog.array_length(parts, 1), 0) <> 3 then
    return false;
  end if;
  if parts[1] <> uid::text or parts[2] !~ uuid_re or parts[3] !~ uuid_re then
    return false;
  end if;
  if not private.are_friends(parts[2]::uuid) then
    return false;
  end if;
  return (
    select count(*) < 200 from storage.objects o
    where o.bucket_id = 'friend-files' and o.name like uid::text || '/%'
  );
end;
$$;

revoke all on function private.friend_file_upload_ok(text) from public, anon;
grant execute on function private.friend_file_upload_ok(text) to authenticated;

create policy "friend-files: leggere i propri, mandati o ricevuti" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'friend-files'
    and (select auth.uid())::text in ((storage.foldername(name))[1], (storage.foldername(name))[2])
  );

create policy "friend-files: caricare solo verso un amico" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'friend-files' and private.friend_file_upload_ok(name));

create policy "friend-files: cancellare i propri, mandati o ricevuti" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'friend-files'
    and (select auth.uid())::text in ((storage.foldername(name))[1], (storage.foldername(name))[2])
  );
