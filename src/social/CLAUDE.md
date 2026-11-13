# Gruppi e Amici

Richiesta originale in `docs/prompt-gruppi.md`, stato e decisioni in `docs/GRUPPI.md` (vale questo se i due non
concordano). Prove: `scripts/gruppi/<modulo>.test.mts`; server: pgTAP in `supabase/tests/database/` (comandi nel
`CLAUDE.md` principale). Tutta la rete passa da `core/cloud/`.

- `registry.ts` è l'unico elenco dei moduli dei Gruppi (ricetta in `docs/ARCHITETTURA.md`). `social` non importa i
  widget: li legge dal bus e dal DB in sola lettura; ciò che serve dai widget (schede della chat, comandi della Stanza)
  glielo passa `app/App.tsx`.
- **Presenza Realtime**: il server chiude un canale con più di 5 `track` in 30 s. Ogni modulo passa da
  `presence/presenceHub.ts` (limite rispettato + via rapida in broadcast), mai `track` diretti. Un hub nuovo si apre
  con `openChannels` e `retryOnReturn` (`presence/openChannels.ts`: al ritorno in primo piano i canali caduti rientrano
  subito invece di aspettare l'attesa crescente).
- **Amici** (mockup `docs/design/amici-notifiche.html`): un elenco a parte dai gruppi, sullo stesso account. Server in
  `supabase/migrations/…_amici.sql` (test `13_amici.sql`): codice personale in `private.friend_codes`, richieste,
  amicizie, `direct_messages` (gli unici messaggi salvati sul server: **90 giorni**, filtro nella policy e pulizia in
  `send_dm`), `direct_reads` per le ✓✓; scritture solo dalle RPC, limiti 20 richieste/ora e 30 messaggi/minuto.
  Tempo reale: le RPC fanno `realtime.send` sulla casella privata `inbox:<user_id>`, che legge solo il proprietario e
  in cui nessun client scrive (`can_access_channel` non la conosce). Client: rete in `core/cloud/friendsApi.ts`, parte
  pura in `friends/friendsStore.ts` (prova `scripts/gruppi/friends.test.mts`), stato in `FriendsProvider.tsx`
  (rilegge tutto all'avvio, al rientro, col ritorno della rete e quando la casella si riallaccia: il tempo reale da
  solo può perdere eventi). Il pulsante `friends/FriendsButton.tsx` lo passa `app/App.tsx` alla dashboard
  (`headerActions`). Link `personaldashboard://amici/<codice>` (deep link, anche in `tauri.android.conf.json`).
- **Schede dei widget nella chat** (il "+"): un widget le dichiara con `chatActions` nella sua `WidgetDefinition`
  (`defineChatAction` di `core/widgets/chatActions.ts`: `kind`, `Compose` che sceglie cosa mandare, `Card` che la
  disegna, `parse` che valida il payload); `app/App.tsx` le raccoglie col pigmento e le passa a `SocialProviders`. Oggi:
  video (`widgets/youtube/chat/`), nota (`widgets/notes/chat/`, una copia senza PDF né allegati in "Ricevute") e invito
  a studiare (`widgets/study/chat/`). Il payload arriva da un'altra persona e il server non lo guarda: `parse` lo
  ripulisce a ogni lettura (l'HTML delle note con `sanitizeHtml` `source: "esterno"`, la miniatura del video solo
  dall'id), un payload non valido o un `kind` sconosciuto diventano la scheda di ripiego. Il `kind` non si cambia dopo
  il rilascio; prova `scripts/gruppi/chatCards.test.mts` (bundle con rolldown). Cornice e finestra di scelta comuni:
  `ui/ChatCard.tsx`, `ui/ChatCompose.tsx`.
- Sessione dell'account: `src-tauri/CLAUDE.md` (desktop) e il plugin secure-store (Android).
