-- Nome e descrizione di un gruppo si cambiano solo dal proprietario (pagina "Impostazioni della stanza").
-- Gli stessi vincoli della tabella (nome 1..40 senza spazi ai bordi, descrizione ≤ 200) valgono anche qui.

create function public.update_group(p_group_id uuid, p_name text, p_description text default '')
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform private.require_uid();
  if not private.is_group_owner(p_group_id) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  update public.groups g
  set name = pg_catalog.btrim(p_name),
      description = coalesce(pg_catalog.btrim(p_description), '')
  where g.id = p_group_id;
end;
$$;

revoke all on function public.update_group(uuid, text, text) from public, anon;
grant execute on function public.update_group(uuid, text, text) to authenticated;
