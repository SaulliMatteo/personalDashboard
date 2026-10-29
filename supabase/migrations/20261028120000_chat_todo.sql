-- Moduli "chat" (Messaggi dal vivo) e "todo" (il foglietto Da fare condiviso dal vivo) della Stanza comune.
-- Niente tabelle: i messaggi viaggiano in broadcast su "group:<id>:chat" e il foglietto in presenza su
-- "group:<id>:todo", e non restano sul server. Come per "pixy", qui si accendono solo i moduli in group_features
-- (gruppi esistenti e, con un trigger, quelli nuovi); la regola dei canali (can_access_channel) vale già.

insert into public.group_features (group_id, feature_key, enabled)
select g.id, f.key, true from public.groups g cross join (values ('chat'), ('todo')) as f(key)
on conflict (group_id, feature_key) do nothing;

-- Gira con i diritti del proprietario della funzione: il client non scrive in group_features.
create function private.enable_chat_todo_features()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.group_features (group_id, feature_key, enabled)
  values (new.id, 'chat', true), (new.id, 'todo', true)
  on conflict (group_id, feature_key) do nothing;
  return new;
end;
$$;

revoke all on function private.enable_chat_todo_features() from public, anon, authenticated;

create trigger groups_enable_chat_todo
after insert on public.groups
for each row execute function private.enable_chat_todo_features();
