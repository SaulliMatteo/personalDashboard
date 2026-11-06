-- Sync dei propri dati tra i propri dispositivi (Studio, Note e Raccolte, Impostazioni: vedi src/core/sync/).
-- A differenza dei moduli dei Gruppi qui ci sono i dati veri, quindi ogni riga è leggibile SOLO dal suo utente:
-- mai shares_group_with. Si scrive solo con sync_push (ultima modifica vince), si legge con una select per `seq`.
-- Il sync è spento di default nell'app: queste righe esistono solo per chi lo accende.

create table public.sync_records (
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- tipo di elemento (SyncKind di src/core/sync/tables.ts)
  kind text not null
    constraint sync_records_kind check (kind in ('subject', 'session', 'folder', 'note', 'page', 'attachment',
      'collection', 'field', 'row', 'view', 'setting')),
  -- id globale dell'elemento (uuid; per le impostazioni la chiave)
  uid text not null
    constraint sync_records_uid check (char_length(uid) between 1 and 100),
  -- colonne dell'elemento con gli id già globali; null se cancellato
  data jsonb,
  -- quando è stato cambiato (ms, orologio del client corretto con server_now)
  changed_at bigint not null,
  deleted boolean not null default false,
  -- dispositivo che l'ha cambiato. Niente FK verso devices: la riga deve restare anche se un giorno quel dispositivo
  -- sparisse (lo controlla sync_push al momento della scrittura).
  device_id uuid not null,
  -- ordine di scrittura per utente: il client legge seq > ultimo letto
  seq bigint not null,
  primary key (user_id, kind, uid),
  constraint sync_records_data check (
    (deleted and data is null) or
    (not deleted and data is not null and jsonb_typeof(data) = 'object' and octet_length(data::text) <= 2000000))
);

create sequence private.sync_records_seq;
revoke all on sequence private.sync_records_seq from public, anon, authenticated;

create index sync_records_user_seq on public.sync_records (user_id, seq);

alter table public.sync_records enable row level security;
revoke all on public.sync_records from public, anon, authenticated;

create policy "sync: solo le proprie righe" on public.sync_records
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Solo lettura diretta: le scritture passano da sync_push (security definer).
grant select (kind, uid, data, changed_at, deleted, device_id, seq) on public.sync_records to authenticated;

-- Scrive un blocco di elementi da un proprio dispositivo. `p_rows`: [{kind, uid, changed_at, deleted, data}].
-- Per ogni elemento vince il changed_at più alto; a parità il device_id più alto (come isNewer di
-- src/core/sync/engine/records.ts), così tutti i dispositivi scelgono lo stesso. changed_at oltre l'ora del server
-- si abbassa a quella: un orologio avanti non deve creare elementi che nessuno può più cambiare.
-- Restituisce gli elementi rifiutati con la versione che c'è nel server, da applicare al posto di quella locale.
create function public.sync_push(p_device_id uuid, p_rows jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_user uuid := private.require_profile();
  now_ms bigint := (extract(epoch from pg_catalog.clock_timestamp()) * 1000)::bigint;
  item jsonb;
  v_kind text;
  v_uid text;
  v_changed bigint;
  v_deleted boolean;
  v_data jsonb;
  rejected jsonb := '[]'::jsonb;
  cur public.sync_records;
begin
  if p_device_id is null
     or not exists (select 1 from public.devices d where d.id = p_device_id and d.user_id = v_user) then
    raise exception 'invalid_device' using errcode = '22023';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'invalid_rows' using errcode = '22023';
  end if;

  -- Un push alla volta per utente: seq viene assegnato e reso visibile nello stesso ordine, quindi chi legge
  -- "seq > cursore" non salta mai una riga scritta da un push concorrente più lento.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('sync_records:' || v_user::text, 0));

  for item in select * from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(item) <> 'object' then
      raise exception 'invalid_rows' using errcode = '22023';
    end if;
    v_kind := item ->> 'kind';
    v_uid := item ->> 'uid';
    v_deleted := coalesce((item ->> 'deleted')::boolean, false);
    v_data := case when v_deleted then null else item -> 'data' end;
    begin
      v_changed := (item ->> 'changed_at')::bigint;
    exception when others then
      raise exception 'invalid_rows' using errcode = '22023';
    end;
    if v_kind is null or v_uid is null or v_changed is null or v_changed < 0 then
      raise exception 'invalid_rows' using errcode = '22023';
    end if;
    v_changed := least(v_changed, now_ms);

    select * into cur from public.sync_records r
    where r.user_id = v_user and r.kind = v_kind and r.uid = v_uid
    for update;

    if not found then
      insert into public.sync_records (user_id, kind, uid, data, changed_at, deleted, device_id, seq)
      values (v_user, v_kind, v_uid, v_data, v_changed, v_deleted, p_device_id, nextval('private.sync_records_seq'));
    elsif v_changed > cur.changed_at or (v_changed = cur.changed_at and p_device_id > cur.device_id) then
      update public.sync_records r
      set data = v_data, changed_at = v_changed, deleted = v_deleted, device_id = p_device_id,
          seq = nextval('private.sync_records_seq')
      where r.user_id = v_user and r.kind = v_kind and r.uid = v_uid;
    elsif not (v_changed = cur.changed_at and p_device_id = cur.device_id) then
      -- più vecchio di quello che c'è (lo stesso elemento rimandato due volte invece non è un rifiuto)
      rejected := rejected || jsonb_build_object('kind', cur.kind, 'uid', cur.uid, 'data', cur.data,
        'changed_at', cur.changed_at, 'deleted', cur.deleted, 'device_id', cur.device_id, 'seq', cur.seq);
    end if;
  end loop;

  return rejected;
end;
$$;

-- Cancella dal server tutti i propri dati sincronizzati (i dispositivi tengono i loro).
create function public.sync_clear()
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_user uuid := private.require_uid();
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('sync_records:' || v_user::text, 0));
  delete from public.sync_records r where r.user_id = v_user;
end;
$$;

revoke all on function public.sync_push(uuid, jsonb), public.sync_clear() from public, anon;
grant execute on function public.sync_push(uuid, jsonb), public.sync_clear() to authenticated;
