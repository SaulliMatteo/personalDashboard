-- Modulo "pixy" (Stanza comune): i Pixy dei compagni nel canale "group:<id>:pixy".
-- Come ogni modulo, si accende per gruppo in group_features e la regola dei canali (can_access_channel) vale già.
-- È il primo modulo aggiunto dopo "study": invece di riscrivere create_group, un trigger lo accende nei gruppi nuovi.

-- I gruppi che esistono già.
insert into public.group_features (group_id, feature_key, enabled)
select g.id, 'pixy', true from public.groups g
on conflict (group_id, feature_key) do nothing;

-- I gruppi nuovi. Gira con i diritti del proprietario della funzione: il client non scrive in group_features.
create function private.enable_pixy_feature()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.group_features (group_id, feature_key, enabled) values (new.id, 'pixy', true)
  on conflict (group_id, feature_key) do nothing;
  return new;
end;
$$;

revoke all on function private.enable_pixy_feature() from public, anon, authenticated;

create trigger groups_enable_pixy
after insert on public.groups
for each row execute function private.enable_pixy_feature();
