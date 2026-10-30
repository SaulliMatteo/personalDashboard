-- Gruppi — autorizzazione Realtime: una sola regola per tutti i moduli.
-- Canali privati con topic "group:<group_id>:<feature_key>": si entra solo se si è membri del gruppo e il modulo
-- è attivo (private.can_access_channel). Un modulo futuro non richiede nuovo codice di sicurezza.
--
-- Nel pannello va disattivato "Allow public access" (Realtime › Settings), così i canali pubblici non funzionano.
-- Note di Supabase: RLS su realtime.messages è già attiva (non riattivarla: errore 42501) e nello schema realtime
-- non si possono creare oggetti; per questo l'helper sta in `private`.

create policy "gruppi: ricevere nei canali dei propri gruppi" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension in ('presence', 'broadcast')
    and private.can_access_channel((select realtime.topic()))
  );

create policy "gruppi: inviare nei canali dei propri gruppi" on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension in ('presence', 'broadcast')
    and private.can_access_channel((select realtime.topic()))
  );
