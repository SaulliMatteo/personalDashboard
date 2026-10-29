-- "Visto 5 min fa": l'ultima volta che un utente è stato connesso ai Gruppi. È un dato del nucleo (vale per ogni
-- modulo), lo vedono solo i compagni di gruppo e l'ora è quella del SERVER (il client non la sceglie).

create table public.last_seen (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  seen_at timestamptz not null default now()
);

alter table public.last_seen enable row level security;
revoke all on public.last_seen from anon, authenticated;

create policy "visto: proprio o di chi condivide un gruppo" on public.last_seen
  for select to authenticated
  using (private.shares_group_with(user_id));

-- Lettura soltanto: si scrive con mark_seen().
grant select on public.last_seen to authenticated;

-- Chiamata dall'app all'accesso e ogni pochi minuti finché è connessa.
create function public.mark_seen()
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_profile();
begin
  insert into public.last_seen (user_id, seen_at) values (uid, pg_catalog.now())
  on conflict (user_id) do update set seen_at = excluded.seen_at;
end;
$$;

revoke all on function public.mark_seen() from public, anon;
grant execute on function public.mark_seen() to authenticated;
