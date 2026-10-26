# Gruppi (studio condiviso in tempo reale)

Funzione **opzionale**: login con Google, gruppi tra amici con codice invito, stato di studio live dei membri e
tempo di studio di oggi e della settimana. Backend: **Supabase** (Postgres + Auth + Realtime), piano gratuito,
regione UE. Nessun server nostro.

> Stato: **tutte le fasi fatte** (backend con test, login Google, scheda Account, invio dei totali, presenza live,
> "visto fa", Pixy in `core/pixy`, widget Gruppi con finestre, stati e impostazioni della stanza, Stanza comune con i
> Pixy sincronizzati, CSP, documentazione, controllo dei segreti).

## Dove sta cosa (app)

```
src/core/cloud/                    UNICO punto con @supabase/supabase-js e con la rete dei Gruppi
├─ config.ts                       variabili d'ambiente (null = "non configurati"), deep link, chiave del portachiavi
├─ client.ts                       createClient: PKCE, storage = portachiavi, fetch con tempo massimo di 15 s
├─ secureStorage.ts                interfaccia SecureStorage + adattatore desktop (invoke secure_store_*): l'unica parte
│                                  legata alla piattaforma
├─ auth.ts                         login nel browser di sistema, ritorno dal deep link, uscita
├─ accountApi.ts                   profilo (nome utente), elimina account, dispositivo, "visto" (mark_seen, last_seen)
├─ studyTotalsApi.ts               totali di studio: upsert dei propri, lettura di quelli dei compagni di gruppo
├─ backoff.ts                      attesa crescente tra i tentativi (5 s → 5 min), la stessa ovunque
├─ groupsApi.ts                    gruppi e membri; crea, entra, esci, rimuovi, rigenera il codice, modifica
├─ inviteCode.ts                   PURO: codice invito scritto come si legge (K7QM-3XRQ) ↔ come lo vuole il server
├─ presence.ts                     canale privato generico group:<id>:<feature> (entra, track, stato, esce)
├─ clock.ts                        scarto dell'orologio rispetto a server_now()
├─ errors.ts                       CloudError: codice nostro + frase fissa in italiano (mai il testo del server)
├─ username.ts                     regole del nome utente (le stesse del server)
├─ useCloud.ts / CloudContext.tsx  stato: unconfigured | unavailable | loading | signedOut | needsUsername | ready |
│                                  unreachable (nuovi tentativi da 5 s a 5 min, e subito al ritorno della rete);
│                                  con l'account pronto chiama mark_seen subito e ogni 5 minuti
src/core/db/meta.ts                getDeviceId(userId): uuid casuale del computer, uno per account
src/social/
├─ types.ts / registry.ts          SocialModule e l'unico elenco dei moduli (gemelli di WidgetDefinition / registry)
├─ SocialProviders.tsx             monta GroupsProvider e sotto i provider dei moduli, in app/App.tsx
├─ groups/                         il nucleo lato UI, comune a tutti i moduli
│   ├─ GroupsContext.tsx + useGroups.ts   gruppi, membri, "visto fa", gruppo scelto, azioni (rilegge dopo ognuna,
│   │                              ogni 5 min e al ritorno della rete; senza rete tiene gli ultimi dati, "vecchi")
│   ├─ groupsState.ts              in che stato è l'utente (non configurati, accesso, nessun gruppo, non raggiungibili…)
│   ├─ data/groupsRepository.ts    gruppo scelto, in meta (per account)
│   └─ components/                 finestre (nome utente, crea, entra), pannelli di stato, icone, groupsUi.css
├─ presence/                       comune ai moduli: presenceHub.ts (PURO, un canale per gruppo, invio ai cambi e al
│                                  massimo ogni N ms), clockSync.ts (scarto dell'orologio), openChannels.ts
├─ widget/                         il widget Gruppi (1×1, M, L) e la sua pagina "Impostazioni della stanza"
├─ room/                           la Stanza comune (vista "room", voce della barra laterale)
│   ├─ RoomPage.tsx                intestazione, sale, dettagli del posto scelto, "Fuori dalla stanza"
│   ├─ RoomScene.tsx               il disegno della sala (token --scene-*), 8 posti, un Pixy vero per posto
│   ├─ SeatPixy.tsx                un animatore per posto: il mio dal Companion, quello degli altri da ciò che condividono
│   ├─ seating.ts                  PURO: chi siede in quale sala e in che ordine (uguale su tutti i computer)
│   ├─ roomText.ts                 PURO: timer, "ultima volta … fa", sottotitolo
│   ├─ useRoomMembers.ts           membri con stato live, oggi e settimana, ricalcolati ogni secondo
│   └─ RoomNavItem.tsx             "Stanza comune" con quanti studiano adesso (passata alla barra da app/AppShell.tsx)
├─ modules/pixy/                   il modulo Pixy (feature_key "pixy", canali group:<id>:pixy)
│   ├─ payload.ts                  PURO: payload v1 (aspetto + cervello se condiviso), validazione, ritorno all'ora locale
│   └─ PixyPresenceProvider.tsx + usePixyPresence.ts   manda il proprio Pixy (al massimo ogni 2 s), raccoglie gli altri
└─ modules/study/
    ├─ index.ts / feature.ts       il modulo (feature_key "study")
    ├─ StudyProvider.tsx           il provider del modulo: invio dei totali + presenza + totali dei compagni
    ├─ leaderboard.ts              PURO: classifica (salvati + sessione in corso), le 5 righe con "me" sempre visibile
    ├─ useLeaderboard.ts           la classifica live di un gruppo, ricalcolata ogni secondo
    ├─ totals/StudyTotalsProvider.tsx + useStudyTotals.ts   oggi e settimana (da lunedì) dei membri: ogni 2 min e
    │                              15 s dopo che qualcuno smette di studiare; i miei dal database locale
    ├─ StudySyncProvider.tsx       collega l'invio a account, activityBus e rete; attivo solo con l'account pronto
    ├─ presence/payload.ts         PURO: payload v1, validazione, più dispositivi, secondi live
    ├─ presence/presenceHub.ts     il hub comune (social/presence) con il payload dello Studio e "fermo da…"
    ├─ presence/StudyPresenceProvider.tsx + useStudyPresence.ts   collega il hub ai gruppi di social/groups
    ├─ sync/plan.ts                PURO: quali giorni mandare e con quanti secondi
    ├─ sync/studySync.ts           PURO (orologio e timer iniettati): un invio alla volta, attese, ogni 15 min
    └─ data/studyTotalsRepository.ts   lettura di study_sessions (sola lettura) e ultimo invio in meta
scripts/gruppi/sync.test.mts       prove dell'invio dei totali
scripts/gruppi/presence.test.mts   prove di payload e canali
scripts/gruppi/leaderboard.test.mts   prove della classifica e del codice invito
scripts/gruppi/room.test.mts       prove di sale, posti e testi della Stanza comune
scripts/gruppi/pixy.test.mts       prove del payload di Pixy e degli invii distanziati del hub
src/core/pixy/myPixy.ts            il MIO Pixy, pubblicato dal Companion (solo memoria, come l'activityBus)
src/core/pixy/engine/poseSnapshot.ts   PURO: un Pixy fermo in una posa (chi non condivide, Companion non in uso)
src/widgets/study/timer/TimerContext.tsx   pubblica studyTimer sul bus (core/activity/activityBus.ts)
src/features/settings/tabs/AccountTab.tsx   accedi, nome utente, esci, elimina account, informativa
src-tauri/src/secure_store.rs      portachiavi del sistema (keyring), valori divisi in pezzi per il Credential Manager
src-tauri/src/lib.rs               single-instance (per primo) + deep-link; in dev su Windows registra lo schema
```

`CloudProvider` sta in `app/App.tsx` sopra `SocialProviders`, che sta sopra `WidgetProviders`: i moduli social
lavorano anche se il widget Gruppi non è in dashboard, come i provider dei widget.

**Prove delle parti pure** (Node 24; `TZ` fisso perché alcune prove usano i cambi d'ora italiani):

```
npx rolldown scripts/gruppi/sync.test.mts --file node_modules/.tmp/gruppi-sync.test.mjs --platform node
TZ=Europe/Rome node node_modules/.tmp/gruppi-sync.test.mjs
npx rolldown scripts/gruppi/presence.test.mts --file node_modules/.tmp/gruppi-presence.test.mjs --platform node
node node_modules/.tmp/gruppi-presence.test.mjs
npx rolldown scripts/gruppi/leaderboard.test.mts --file node_modules/.tmp/gruppi-leaderboard.test.mjs --platform node
node node_modules/.tmp/gruppi-leaderboard.test.mjs
npx rolldown scripts/gruppi/room.test.mts --file node_modules/.tmp/gruppi-room.test.mjs --platform node
node node_modules/.tmp/gruppi-room.test.mjs
npx rolldown scripts/gruppi/pixy.test.mts --file node_modules/.tmp/gruppi-pixy.test.mjs --platform node
node node_modules/.tmp/gruppi-pixy.test.mjs
```

**Provare in locale**: con lo stack di `npx supabase start` si può avviare l'app puntata lì, senza `.env.local`:
`VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` come variabili d'ambiente (valori di
`npx supabase status`). Il login Google in locale non funziona (il provider non è configurato nello stack locale):
tutto il resto sì. In `tauri dev` su Windows lo schema `personaldashboard://` viene registrato per l'eseguibile di
`target/debug`; l'installer della versione installata lo riporta sul suo.

## Dove sta cosa (backend)

```
.env.example                       segnaposto di VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY (il vero è .env.local)
supabase/
├─ config.toml                     configurazione dello stack LOCALE (redirect = deep link; storage/edge/analytics spenti)
├─ migrations/
│   ├─ 20261024120000_nucleo.sql   profili, dispositivi, gruppi, membri, moduli, helper delle policy, RPC
│   ├─ 20261024120100_studio.sql   study_daily_totals + vista study_totals_by_user
│   ├─ 20261024120200_realtime.sql la regola unica sui canali group:<id>:<feature>
│   ├─ 20261024120300_visto.sql    last_seen + mark_seen ("visto 5 min fa")
│   ├─ 20261024120400_modifica_gruppo.sql   update_group (nome e descrizione, solo il proprietario)
│   └─ 20261024120500_pixy.sql     modulo "pixy": acceso nei gruppi esistenti e, con un trigger, in quelli nuovi
└─ tests/database/                 test pgTAP delle regole di accesso (_aiuti.psql = utenti finti e cambio ruolo)
```

Test (servono Docker Desktop acceso e la CLI, devDependency `supabase`):

```
npx supabase start      # la prima volta scarica le immagini; applica le migrazioni
npx supabase test db    # esegue supabase/tests/**
npx supabase db reset   # riapplica da zero le migrazioni (dopo averne aggiunta una)
npx supabase stop
```

Un nuovo modulo aggiunge una migrazione in fondo e un file di test con le sue tabelle; il controllo "RLS attiva su
ogni tabella" in `01_accesso.sql` copre in automatico anche le tabelle nuove.

```
      app desktop (Tauri)                                       Supabase (UE)
┌──────────────────────────────────┐                  ┌──────────────────────────────┐
│ widgets/study  ──activityBus──▶  │                  │ Auth (Google, PKCE)          │
│ social/modules/study             │                  │ Postgres + RLS               │
│   (sync totali, presenza)        │──core/cloud────▶ │   nucleo + modulo studio     │
│ social/widget (widget Gruppi)    │  HTTPS / WSS     │   RPC SECURITY DEFINER       │
│ features/settings › Account      │                  │ Realtime (canali privati)    │
│ SQLite locale = fonte di verità  │                  └──────────────────────────────┘
└──────────────────────────────────┘
        ▲ deep link personaldashboard://auth/callback
        │
  browser di sistema (login Google)
```

## 1. Cosa resta locale

- Il **SQLite locale resta la fonte di verità**. Senza account, offline o senza configurazione l'app funziona come
  oggi: le funzioni di gruppo sono solo non disponibili.
- Escono dal dispositivo **solo**:
  - i **totali giornalieri** di studio (secondi per giorno locale, per dispositivo);
  - lo **stato live del timer** (fase, modalità, inizio, durata) e la **sala** scelta nella stanza comune;
  - l'**ultima volta che si è stati connessi** (ora del server, per "visto 5 min fa"; deciso in Fase 4);
  - la **materia in corso**, solo se l'utente attiva "Mostra la materia ai gruppi" (spenta di default);
  - l'**aspetto di Pixy** (personalità, colore, bocca); le sue **pose ed espressioni** (che rivelano che tipo di app è
    in primo piano) solo con "Condividi le espressioni di Pixy", i suoi **fumetti** solo con "Condividi anche i
    fumetti" (spente di default).
- **Non** escono: sessioni singole, materie (elenco, colori, obiettivi), note, video, file, impostazioni.
- Stati della funzione, mostrati in UI:
  - variabili d'ambiente mancanti → **"Gruppi non configurati"** (l'app compila e funziona in solo locale);
  - non connesso → invito ad accedere;
  - backend non raggiungibile (offline, oppure progetto Supabase in pausa) → **"Gruppi non raggiungibili"**, nuovi
    tentativi con backoff esponenziale (es. 5 s → 10 s → … max 5 min), nessun errore a catena;
  - connesso.

## 2. Architettura lato app

### Livelli e dipendenze

```
app → features, widgets, social, core
features → core, widgets/registry, ui
widgets/registry → social        (solo per registrare il widget Gruppi)
widgets/<nome> → core, ui
social → core, ui                (NUOVO)
core → ui (come oggi)
ui → niente
```

- **`src/core/cloud/`** — l'**unico** punto che importa `@supabase/supabase-js` e l'unico che parla con il cloud
  (gemello di `weatherApi.ts` per la regola "un solo punto per la rete"). Espone un'interfaccia nostra:
  - `client.ts`: crea il client, oppure `null` se mancano `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`;
  - `auth.ts`: login (PKCE + browser di sistema + deep link), logout, sessione, `set_username`, `delete_account`;
  - `secureStorage.ts`: interfaccia `SecureStorage` (`getItem` / `setItem` / `removeItem`) + adattatore desktop che
    chiama i comandi Rust del portachiavi. È **l'unica parte che assume il desktop**: per il mobile basterà un altro
    adattatore;
  - `accountApi.ts`, `studyTotalsApi.ts` (e i prossimi `*Api.ts`): chiamate RPC e query tipizzate, una per area;
  - `presence.ts`: canale generico `group:<id>:<feature>` (entra, `track`, ascolta, esce). Non conosce lo studio;
  - `clock.ts`: scarto tra orologio locale e del server (`server_now()`);
  - `CloudContext.tsx` + `useCloud.ts`: stato (non configurato / disconnesso / connesso / non raggiungibile), profilo.
- **`src/social/`** — il livello di gruppo. Oggi contiene solo lo studio; in futuro moduli legati agli altri widget e,
  un giorno, un **luogo comune con i Pixy di tutti** (ognuno mostra cosa sta facendo e da quanto).
  - `social/registry.ts`: elenco dei moduli social, gemello di `widgets/registry.ts`.
    `SocialModule = { key, name, provider?, MemberSection?, … }`. **Aggiungere un modulo = cartella + una riga.**
  - `social/modules/study/`: primo modulo (`feature_key = 'study'`):
    - `data/studyTotalsRepository.ts`: query in **sola lettura** su `study_sessions` (stessa attribuzione al giorno
      del report: `ended_at`, giorno locale);
    - `sync/plan.ts` e `sync/studySync.ts` (puri, orologio iniettato): giorni da mandare, totali per giorno, invio
      con attese. I totali della settimana (lunedì–domenica, `core/report/periods.ts`) li legge `totals/`;
    - `presencePayload.ts` (puro): costruzione e validazione del payload;
    - provider: sincronizzazione dei totali e presenza nei canali dei propri gruppi.
  - `social/SocialProviders.tsx`: monta i provider dei moduli in `app/App.tsx` (deciso in Fase 3: non dipende dal
    widget, che può non essere in dashboard).
  - `social/groups/`: il nucleo lato UI (gruppi, membri, gruppo scelto, azioni, finestre e stati), sotto tutti i moduli.
  - `social/widget/`: il widget **Gruppi** (`WidgetDefinition` con id `groups`, registrato in `widgets/registry.ts`):
    1×1 (quanti studiano ora e un pallino per membro), M (classifica di oggi o della settimana), L (classifica + spazio
    "Messaggi", fuori dalla v1). La pagina di dettaglio è "Impostazioni della stanza". Finché l'account non è pronto,
    non c'è un gruppo o il server non risponde, al posto dei dati c'è lo stato (stati.html, primo-accesso.html).
- **Come un modulo legge un widget senza importarlo**: tramite `core/activity/activityBus.ts`. Lo Studio pubblicherà
  un nuovo stato `studyTimer` (fase, modalità, `runningSince`, durata della fase, secondi accumulati, materia) e già
  emette `studyStopped` (che fa partire la sincronizzazione). I totali passati si leggono dal DB in sola lettura.
- **Pixy condivisi (Fase 5)**: motore e disegno di Pixy sono stati spostati da `widgets/companion/` a `core/pixy/` (5a) e
  disegnati da `core/pixy/PixyFace.tsx`: `social` li usa senza importare il widget. Nella Stanza comune (5c) ogni Pixy di
  un compagno ha il suo animatore, alimentato dallo stato del cervello che quel compagno condivide (solo se lo attiva).
  Decisioni (Fase 5, con l'autore):
  - le pose di Pixy rivelano l'app in primo piano (giochi, Discord, YouTube…): si condividono **solo** con
    l'impostazione "Condividi le espressioni di Pixy", spenta di default. Spenta, gli altri vedono il tuo Pixy vero
    ma con le sole pose dello studio, ricavate dal timer già condiviso;
  - i **fumetti** si mandano solo con un'impostazione propria (che vale solo con le espressioni condivise), e chi
    guarda può spegnere "Mostra i fumetti degli altri" per non vederli anche se gli altri li mandano;
  - la Fase 5 è divisa in tre tappe con stop: 5a spostamento di Pixy in `core/pixy`, 5b widget, finestre, stati e
    impostazioni della stanza, 5c Stanza comune con i Pixy sincronizzati.
- **Stanza comune (5c)**: vista `room` di `core/nav` (`openRoom`), voce della barra laterale passata da
  `app/AppShell.tsx` (`features` non importa `social`); non c'è se i Gruppi non sono configurati. Si siede chi ha il
  timer avviato (anche in pausa); chi è connesso col timer fermo e chi è offline stanno in "Fuori dalla stanza".
  - **Sale** (`room/seating.ts`): 8 posti; chi ha scelto una sala ("Siediti in questa sala", mandata nel payload dello
    Studio come `room`) ci si siede se c'è posto, gli altri riempiono dalla prima in ordine di ingresso nel gruppo.
    Stessi dati → stesso risultato su tutti i computer. La scelta vale finché l'app resta aperta.
  - **Il mio Pixy** è quello del Companion (`core/pixy/myPixy.ts`, pubblicato da `CompanionContext.tsx`), come lo vedo
    nel widget. Con "Condividi le espressioni di Pixy" il Companion lavora anche se non è in dashboard; senza, e se il
    Companion non è in uso, al mio posto c'è la posa dello studio.
  - **Il Pixy di un compagno** ha il suo animatore (`room/SeatPixy.tsx`): con le espressioni condivise segue il suo
    cervello (reazioni e fumetti riportati all'ora locale e tolti quando finiscono), altrimenti la posa dello studio
    ricavata dal timer: studia → `study`, in pausa a metà → `study_wait`, pausa del pomodoro → `study_break`.
    Personalità, colore e bocca arrivano sempre: non dicono nulla di ciò che si fa.
  - In Opaco la sala usa il pigmento del widget Gruppi (`widgetPigment("groups")`, passato da `app/App.tsx`).
- **Payload Pixy v1** (`modules/pixy/payload.ts`, canale `group:<id>:pixy`; istanti in ms dell'ora del server):
  ```ts
  {
    v: 1,
    personality: "cheerful" | "calm" | "sleepy" | "grumpy",
    color: "accent" | "face",               // i colori veri sono quelli del tema di chi guarda
    showMouth: boolean,
    brain?: {                               // solo con groupsSharePixy (e il Companion in uso)
      pose, mood, gaze, glyph, costume, costumeValue, motion, doze, screenGlow, tempo, blink, wander, breath,
      reaction: { pose, emotion, glyph, costume?, motion?, gaze?, doze?, tempo?, startedAt, until, priority } | null,
      bubble: { id, text, until, durationMs } | null   // solo con groupsSharePixyBubbles
    }
  }
  ```
  Validazione: versione diversa → ignorato; personalità, colore e bocca obbligatori; pose, emozioni, simboli, costumi,
  sguardi e movimenti solo dagli elenchi di `core/pixy`; `tempo` 0–4, `costumeValue` 0–1, reazione e fumetto al
  massimo 10 minuti e vicini all'ora del server, fumetto non vuoto e ≤ 160 caratteri. Un cervello non valido si
  scarta e resta l'aspetto; i campi in più si tolgono. Il fumetto si mostra come testo (mai HTML). Più dispositivi:
  vince quello che condivide le espressioni. Invio: solo ai cambi, al massimo ogni 2 s (parte comunque l'ultimo stato).
- **Account**: nuova scheda `features/settings/tabs/AccountTab.tsx` (accedi, nome utente, esci, elimina account,
  informativa sui dati condivisi).
- **Impostazioni** (gruppo `groups` di `core/settings/schema.ts`, anche nella pagina "Impostazioni della stanza"):
  `groupsShowSubject` (default `false`), `groupsSharePixy` "Condividi le espressioni di Pixy" (`false`),
  `groupsSharePixyBubbles` "Condividi anche i fumetti" (`false`, vale solo con la precedente; i fumetti possono
  contenere il nome dell'utente e delle app), `groupsShowOthersBubbles` "Mostra i fumetti degli altri" (`true`, solo
  per chi guarda).

## 3. Schema cloud (Postgres)

Regola: **nessuna tabella generica con JSON**. Ogni modulo ha tabelle proprie, tipizzate, con vincoli e RLS.
Migrazioni in `supabase/migrations/` (Supabase CLI) con le stesse regole di quelle locali: solo aggiunte in fondo,
mai modificare una migrazione rilasciata, **nessuna modifica fatta a mano nel pannello**.

### Nucleo

| Tabella | Colonne | Note |
|---|---|---|
| `profiles` | `id uuid PK → auth.users ON DELETE CASCADE`, `username text UNIQUE`, `created_at` | nessuna email, nessun nome reale |
| `devices` | `id uuid PK`, `user_id → profiles ON DELETE CASCADE`, `platform`, `created_at`, `last_seen_at`; `UNIQUE (user_id, id)` | `platform ∈ windows, macos, linux, android, ios` |
| `groups` | `id`, `name` (1–40), `description` (≤200), `owner_id → profiles`, `invite_code UNIQUE`, `max_members` (default 30, 2–30), `created_at` | |
| `group_members` | `group_id → groups ON DELETE CASCADE`, `user_id → profiles ON DELETE CASCADE`, `role ∈ owner, member`, `joined_at`; PK `(group_id, user_id)` | un solo `owner` per gruppo (indice unico parziale) |
| `group_features` | `group_id → groups ON DELETE CASCADE`, `feature_key`, `enabled`; PK `(group_id, feature_key)` | `study` attivo alla creazione |
| `last_seen` | `user_id uuid PK → profiles ON DELETE CASCADE`, `seen_at timestamptz` | "visto 5 min fa": ora del **server**, scritta solo da `mark_seen()` (Fase 4) |
| `private.join_attempts` | `user_id`, `attempted_at` | interna (schema non esposto): nessun privilegio ai client, usata da `join_group` |

**Nome utente** (approvato): `^[a-z0-9_.]{3,20}$`, salvato in minuscolo (unicità quindi case-insensitive), senza
punto iniziale o finale e senza `..`. Vincolo `CHECK` sulla colonna + controllo in `set_username`.

**Codice invito**: generato dal server con `extensions.gen_random_bytes` (crittografico), 8 caratteri dall'alfabeto
`ABCDEFGHJKMNPQRSTUVWXYZ23456789` (niente `0 O 1 I L`; tutto maiuscolo, quindi niente `l`). Unico (riprova in caso di
collisione), rigenerabile dall'owner, leggibile **solo** dai membri (sta in `groups`, che è leggibile solo dai membri).

### Modulo studio

| Tabella | Colonne | Note |
|---|---|---|
| `study_daily_totals` | `user_id`, `device_id`, `day date`, `seconds int CHECK (0..86400)`, `updated_at`; PK `(user_id, device_id, day)`; FK `(user_id, device_id) → devices(user_id, id) ON DELETE CASCADE` | i totali sono **dell'utente**, non del gruppo |

- `day` è il **giorno locale** dell'utente. Un trigger `BEFORE INSERT OR UPDATE` rifiuta giorni oltre
  `oggi UTC + 1` (fuso massimo +14 h) o più vecchi di 60 giorni.
- Il server **somma i dispositivi**: vista `study_totals_by_user (user_id, day, seconds)` con
  `security_invoker = true`, quindi valgono le RLS di chi legge (sé e chi condivide un gruppo).
- La FK composta impedisce di scrivere su un dispositivo di un altro.

### Funzioni di supporto (riusate da tutte le policy, presenti e future)

- `is_group_member(p_group_id uuid) → bool`
- `is_group_owner(p_group_id uuid) → bool`
- `shares_group_with(p_user_id uuid) → bool` (vero anche per sé stessi)
- `can_access_channel(p_topic text) → bool`: controlla il formato `group:<uuid>:<feature_key>` con una regex
  **prima** del cast a `uuid` (un topic malformato dà `false`, non un errore), poi membro + `group_features.enabled`.

Tutte `SECURITY DEFINER` (per non ricorrere nelle RLS di `group_members`), `STABLE`, `SET search_path = ''`, nomi
completamente qualificati, basate su `auth.uid()`. Stanno in uno schema `private` non esposto dall'API.

## 4. Policy e privilegi

- **RLS attive su tutte le tabelle**, senza eccezioni. `REVOKE ALL … FROM anon` (e da `public`) su tabelle e
  funzioni: un utente non autenticato non legge nulla. A `authenticated` solo i privilegi necessari.
- Lettura:
  - `profiles`: propria riga o `shares_group_with(id)`;
  - `groups`, `group_members`, `group_features`: `is_group_member(group_id)`;
  - `study_daily_totals`: proprie righe o `shares_group_with(user_id)`;
  - `devices`: solo i propri;
  - `last_seen`: propria riga o `shares_group_with(user_id)`;
  - `join_attempts`: nessuno.
- Scrittura diretta (insert/update):
  - `devices`: nessuna; si registra con l'RPC `touch_device` (così `last_seen_at` è l'ora del server e un id
    già usato da un altro utente viene rifiutato);
  - `study_daily_totals`: solo con `user_id = auth.uid()` (upsert idempotente).
  - Tutto il resto **solo** tramite RPC.
- L'email e i dati Google stanno solo in `auth.users`, che non è esposto: nessuna tabella pubblica li copia.

### RPC (`SECURITY DEFINER`, `SET search_path = ''`, controllano sempre `auth.uid()`)

| Funzione | Cosa fa |
|---|---|
| `server_now()` | restituisce l'ora del server (correzione dell'orologio) |
| `touch_device(device_id, platform)` | registra il dispositivo o ne aggiorna l'ultimo accesso |
| `mark_seen()` | "sono connesso adesso": `last_seen` con l'ora del server. L'app la chiama all'accesso e ogni 5 minuti |
| `set_username(name)` | crea o aggiorna il profilo; valida il formato; nome già preso → errore chiaro |
| `create_group(name, description)` | genera il codice, inserisce gruppo, owner e `group_features('study', true)` |
| `join_group(code)` | registra il tentativo, applica il limite (**10 tentativi / 10 minuti** per utente), controlla codice e `max_members`. **Restituisce uno stato** (`ok`, `invalid`, `full`, `rate_limited`, `already_member`) invece di sollevare un'eccezione: altrimenti il rollback annullerebbe anche il tentativo registrato e il limite non funzionerebbe |
| `update_group(group_id, name, description)` | solo il proprietario; stessi vincoli della tabella (nome 1–40, descrizione ≤ 200) |
| `leave_group(group_id)` | se esce l'owner, la proprietà passa al **membro più anziano** (`joined_at`); se il gruppo resta vuoto viene **eliminato** |
| `remove_member(group_id, user_id)` | solo owner, non su sé stesso |
| `regenerate_invite_code(group_id)` | solo owner |
| `delete_account()` | esce da tutti i gruppi (stessa logica di `leave_group`), poi `DELETE FROM auth.users WHERE id = auth.uid()`: a cascata profilo, dispositivi, iscrizioni, totali. Nessuna `service_role` nel client |

### Realtime

- Canali con nome a schema fisso **`group:<group_id>:<feature_key>`** (oggi `group:<id>:study`).
- Solo canali **privati** (`config: { private: true }`) e "Allow public access" **disattivato** nelle impostazioni
  Realtime del progetto.
- **Una sola regola** su `realtime.messages`, per `SELECT` e `INSERT`:
  `private.can_access_channel((select realtime.topic()))` con `extension in ('presence', 'broadcast')`.
  Un modulo futuro (es. `group:<id>:cinema`) non richiede nuovo codice di sicurezza: basta la riga in
  `group_features`.
- Insidie di Supabase da rispettare nelle migrazioni:
  - **non** eseguire `ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY` (è già attiva; fallisce con `42501`);
  - non creare oggetti nello schema `realtime` (permesso negato): gli helper stanno in `private`.
- L'autorizzazione è memorizzata per connessione: chi viene rimosso da un gruppo perde l'accesso al canale solo alla
  scadenza del suo JWT. Si accetta, tenendo la durata del JWT al valore predefinito (1 h) o più corta.

## 5. Flussi

### Login (Google, desktop)

1. `signInWithOAuth({ provider: 'google', options: { redirectTo: 'personaldashboard://auth/callback',
   skipBrowserRedirect: true } })` con il client in `flowType: 'pkce'`: restituisce l'URL senza navigare.
2. L'app apre l'URL nel **browser di sistema** con il plugin opener (mai nella webview).
3. Google → Supabase → redirect a `personaldashboard://auth/callback?code=…`.
4. Su Windows il deep link avvia una seconda istanza: **single-instance** (feature `deep-link`) la chiude e inoltra
   l'URL all'istanza aperta; il plugin **deep-link** lo consegna al frontend (`onOpenUrl`).
5. `exchangeCodeForSession(code)`: il code verifier PKCE era stato salvato nello stesso storage sicuro. Un link di
   ritorno senza verificatore (vecchio o falsificato) fallisce lo scambio e viene ignorato; se il login viene
   completato ad app chiusa, all'avvio il link arriva da `getCurrent()` e funziona lo stesso.
6. La sessione viene salvata dallo storage personalizzato nel **portachiavi del sistema**. Mai in SQLite,
   `localStorage` o file in chiaro.
7. Senza profilo → schermata "Scegli il nome utente" (`set_username`).
8. Logout: `signOut`, rimozione delle voci dal portachiavi, chiusura dei canali.
9. Elimina account: conferma esplicita → `delete_account()` → logout locale. I dati locali restano.

Il login usa solo gli scope base (`openid`, `email`, `profile`), che Supabase richiede di default.

### Sincronizzazione dei totali

- `device_id`: uuid casuale creato al primo invio, salvato in `meta` (`core/db/meta.ts`, chiave
  `cloud_device_id:<user_id>`) e registrato con `touch_device` una volta per avvio. È **per account**: sul server
  un dispositivo appartiene a un solo utente, e un secondo account sullo stesso PC sarebbe rifiutato
  (`invalid_device`, verificato contro lo stack locale).
- Si **ricalcola** dal SQLite locale (`study_sessions`, attribuzione per `ended_at`, giorno locale "AAAA-MM-GG") e
  si fa **upsert** su `study_daily_totals` (`on conflict (user_id, device_id, day)`): rimandare le stesse righe non
  cambia nulla, quindi non serve una coda offline. Si mandano **anche i giorni a 0** della finestra, così una sessione
  cancellata in locale (es. insieme alla sua materia) sparisce anche dal server. Un giorno oltre 86400 s (sessioni
  sovrapposte) si taglia a 86400, il massimo accettato dal server.
- Giorni da mandare (`sync/plan.ts`):
  - primo invio con questo account su questo PC: **ultimi 14 giorni** (oggi compreso);
  - poi: dal giorno dell'ultimo invio riuscito (salvato in `meta`, `groups_study_last_sync:<user_id>`) a oggi,
    **sempre compreso ieri** (una sessione chiusa dopo mezzanotte può finire nel giorno prima: lo stop automatico
    toglie il tempo di assenza);
  - al massimo 14 giorni; un ultimo invio "nel futuro" (orologio spostato) vale come ieri.
  - L'ultimo invio salvato è l'istante d'**inizio** del tentativo riuscito: ciò che si registra durante l'invio
    rientra nel successivo.
- Quando (`StudySyncProvider.tsx`), solo con l'account `ready`:
  - all'avvio e quando l'account diventa pronto;
  - quando cambiano i secondi di oggi sul bus (`studyTodaySeconds`, cioè una sessione registrata), dopo 5 s per
    unire i cambi ravvicinati. Il bus copre anche le sessioni registrate dal widget YouTube (le conta il refresh al
    minuto dello Studio);
  - al ritorno della rete (`online`), subito e azzerando le attese;
  - comunque ogni 15 minuti (cambio di giorno, modifiche ai giorni passati).
- Un invio alla volta: una richiesta durante un invio ne fa partire **uno solo** subito dopo.
- Errori: servizio non raggiungibile o altro errore → nuovo tentativo dopo 5 s, 10 s, 20 s… fino a 5 min
  (`core/cloud/backoff.ts`, lo stesso dell'account); nei log solo il nostro codice d'errore, mai il testo del server.
  Sessione non più valida → l'account rilegge la sessione ed esce; l'invio si ferma.

### Presenza in tempo reale

- **Da dove arriva lo stato**: `TimerContext.tsx` pubblica sul bus `studyTimer` (`StudyTimerSnapshot`: fase work/break,
  modalità, `runningSince`, durata della fase, secondi già fatti, `changedAt`; null = timer fermo), un oggetto nuovo
  solo quando cambia lo stato. La materia arriva da `studySubjectName`, già sul bus, e si manda solo se l'impostazione
  `groupsShowSubject` (gruppo `groups`, spenta di default) è attiva. Il modulo non importa il widget Studio.
- **Quali canali** (`presence/StudyPresenceProvider.tsx`, solo con l'account `ready`): i gruppi con `study` attivo
  presi da `social/groups` (`useGroups`), che li rilegge all'avvio, ogni 5 minuti, al ritorno della rete e dopo crea /
  entra / esci / rimuovi. Un canale `group:<id>:study` per gruppo, privato, con chiave
  di presenza = `user_id`. Prima di entrare il token della sessione va al client Realtime (`authorizeRealtime`).
- **Invio** (`presence/presenceHub.ts`): `track` appena entrati (anche quando Realtime rientra da solo dopo un calo
  di rete: il server ha perso lo stato) e poi **solo se il payload cambia** (avvio, pausa, ripresa, fine fase, cambio
  materia o sala). Mai un messaggio al secondo: chi riceve calcola il timer da sé. Un invio rifiutato si ripete al
  cambio successivo.
- **Canale caduto** (errore, token scaduto, accesso negato): si esce, i membri di quel gruppo risultano offline e si
  rientra dopo 5 s, 10 s, 20 s… fino a 5 minuti; un rientro riuscito azzera le attese.
- **Payload v1** (`presence/payload.ts`; istanti in ms **dell'ora del server**):
  ```ts
  {
    v: 1,
    phase: "idle" | "work" | "break",       // short_break e long_break → break; idle = connesso, timer fermo
    mode: "pomodoro" | "stopwatch",
    runningSince: number | null,            // null = in pausa (o fermo)
    phaseTotalSeconds: number,              // 0 in cronometro
    accumulatedSeconds: number,             // secondi già fatti nella fase prima di runningSince
    changedAt: number,                      // ultimo cambio di stato ("in pausa da…")
    subject?: string,                       // solo con groupsShowSubject, solo durante lo studio, ≤ 40 caratteri
    room?: number                           // sala scelta nella stanza comune, 0–3 (8 posti × 4 sale ≥ 30 membri)
  }
  ```
  `idle` resta nel payload apposta: chi ha l'app aperta col timer fermo è **connesso** (in classifica e nella lista
  dei membri) ma **fuori dalla stanza** (deciso in Fase 4). Altri moduli potranno dire "connesso" con il loro canale.
  La sala vale per gruppo ed è condivisa: senza scelta si usa il riempimento automatico, uguale su tutti i computer.
- **Validazione** di ogni payload ricevuto: versione `v` diversa da 1 → **ignorata** senza errori (gli amici
  aggiornano l'app in momenti diversi); tipi e valori ammessi, numeri finiti tra 0 e 86400, `runningSince` entro
  ±24 h dall'ora del server, `changedAt` non nel futuro, `idle` senza `runningSince`, testo ≤ 40, `room` intero
  0–3. Payload non valido → scartato; i campi sconosciuti si tolgono. Il testo resta testo (mai HTML in UI).
- **Più dispositivi dello stesso utente** (stessa chiave): vince chi studia, poi chi è in pausa a metà, poi la pausa
  del pomodoro, poi il connesso; a pari merito il cambio più recente.
- **Correzione dell'orologio** (`core/cloud/clock.ts`): `offset = serverNow − (t0 + t1) / 2` con `server_now()`,
  all'avvio e ogni 10 minuti. In invio gli istanti locali si convertono all'ora del server; chi riceve usa
  `serverNow()` del contesto.
- Chi non è nel canale risulta **offline**; per lui la UI mostra "visto … fa" da `last_seen`.
- Classifica live = totale salvato di oggi (o della settimana) + `unsavedStudySeconds` (i secondi della fase di
  studio in corso, anche in pausa a metà, non ancora registrati). Le pause del pomodoro non contano.

## 6. Limiti accettati

- **Anti-cheat**: il tempo è dichiarato dal client e si può falsificare (uso tra amici). Il server impone solo limiti
  di plausibilità (`seconds` 0–86400 per giorno e dispositivo, giorno né futuro né troppo vecchio).
- **Pausa del piano gratuito**: un progetto Supabase gratuito senza attività per una settimana va in pausa. L'app lo
  tratta come offline ("Gruppi non raggiungibili"); va riattivato dal pannello.
- **Nessun backup cloud**: il cloud contiene solo totali giornalieri; i dati veri restano solo sul PC.
- **Revoca Realtime ritardata** fino alla scadenza del JWT (vedi sopra).
- Un utente rimosso da un gruppo può rientrarci se conosce ancora il codice: l'owner lo rigenera.
- **Chiave di presenza non legata all'utente**: Realtime lascia scegliere la chiave al client, quindi un membro di
  un gruppo può pubblicare uno stato live con la chiave di un altro membro **dello stesso gruppo** (verificato contro
  lo stack locale). Chi non è membro non entra nel canale. Si accetta come il tempo dichiarato dal client (uso tra
  amici): i totali salvati restano protetti dalle RLS, e la UI mostrerà solo le chiavi dei membri del gruppo.
- **"Visto fa" approssimato**: `mark_seen` va ogni 5 minuti, quindi "visto" ha quella precisione.
- **Modifiche a giorni vecchi**: si rimandano solo i giorni dall'ultimo invio (minimo ieri). Se si cancella una
  materia con sessioni di più giorni fa, quei giorni sul server restano col valore vecchio finché non escono dalla
  finestra mostrata (oggi e settimana).
- **Account eliminato e poi ricreato**: è un nuovo `user_id`, quindi nuovo `device_id` e di nuovo 14 giorni.

## 7. Sicurezza: come viene rispettata la checklist

| # | Punto | Dove |
|---|---|---|
| 1 | RLS ovunque, niente accesso `anon` | migrazioni, test pgTAP |
| 2 | Lettura/scrittura limitate | policy §4 |
| 3 | Operazioni sensibili via RPC `SECURITY DEFINER` + `search_path = ''` | §4 |
| 4 | Codice invito crittografico, 8 caratteri non ambigui | §3 |
| 5 | Limite ai tentativi di `join_group` | §4 |
| 6 | Vincoli lato server | `CHECK` + trigger |
| 7 | Solo canali privati | §4 Realtime |
| 8 | Niente dati personali superflui, niente avatar remoti | §4 |
| 9 | Testo degli altri sempre come testo (niente `dangerouslySetInnerHTML`) | UI: nomi, descrizioni e fumetti di Pixy solo come testo React |
| 10 | CSP restrittiva | `tauri.conf.json` (`csp`/`devCsp`), sotto "CSP" |
| 11 | Permessi Tauri minimi (`deep-link:default`) | `capabilities/default.json` |
| 12 | GDPR: elimina account, informativa, condivisione materia spenta | Account, impostazioni |
| 13 | Versioni dei plugin verificate | §8 |

### CSP
In `src-tauri/tauri.conf.json`, `app.security`. Fuori da `'self'` sono ammessi solo: `https://*.supabase.co` e
`wss://*.supabase.co` (il riferimento del progetto sta solo in `.env.local`, per questo il jolly), le due API di
Open-Meteo, YouTube (script dell'API del player, `frame-src` del player, miniature `i.ytimg.com`, oEmbed) e, solo su
macOS, `http://localhost:14321`. `style-src` ha `'unsafe-inline'` (React e le librerie scrivono stili in linea:
`dangerousDisableAssetCspModification: ["style-src"]` evita che Tauri ci aggiunga un nonce che lo annullerebbe);
`script-src` no: lo script inline di `index.html` lo autorizza Tauri con un hash. `devCsp` aggiunge il server di Vite
e Supabase locale, ma in `tauri dev` Tauri non la applica (pagina servita da Vite): la CSP si prova solo con
`npm run tauri build`.
Provato sulla build di rilascio (Windows): Supabase https e wss (handshake 101), Meteo, miniature e player di YouTube,
font locali, immagini `data:` (export delle note) senza violazioni; `fetch`/immagini verso un dominio esterno e
script inline aggiunti a mano bloccati. **Non verificato**: macOS (`localhost:14321` e l'header CSP servito da
`tauri-plugin-localhost`), login Google completo dalla build di rilascio.

**Segreti**: nel repo e nell'app **mai** la `service_role` / secret key, la password del DB, stringhe Postgres, il
client secret Google, token personali o di sessione, dati reali di utenti. URL e chiave *publishable* sono pubblici per
progetto (protetti dalle RLS), ma comunque **non committati**: arrivano da `.env.local` (in locale) e da GitHub Actions
Secrets (release). Nessun token o chiave in `console.log`, nei log Rust o nei messaggi di errore.

## 8. Dipendenze nuove (verificate per `tauri 2.11.3`)

| Pacchetto | Versione | Motivo del pin |
|---|---|---|
| `tauri-plugin-deep-link` (crate) | `=2.4.10` | dalla 2.5.0 richiede `tauri ^2.12`. Va pinnato anche nel nostro `Cargo.toml`: il `^2.4.10` di single-instance altrimenti risolverebbe a 2.6.x |
| `@tauri-apps/plugin-deep-link` (npm) | `2.4.10` | stessa versione del crate; richiede `@tauri-apps/api ^2.11.0` |
| `tauri-plugin-single-instance` (crate, feature `deep-link`) | `=2.4.5` | dalla 2.5.0 richiede `tauri ^2.12` |
| `keyring` (crate) | `3.6.3`, feature `windows-native` + `apple-native` | la 4.x richiede Rust 1.88 ed edizione 2024 |
| `@supabase/supabase-js` (npm) | `2.118.0` (fissata) | PKCE, `storage` personalizzato, `exchangeCodeForSession` |
| `supabase` (npm, dev) | ultima stabile, fissata | CLI per migrazioni e test (`npx supabase`) |

- Si fissa anche `tauri = "=2.11.3"` (Fase 2): `"2.11.3"` vorrebbe dire `^2.11.3` e accetterebbe la 2.12.
- **Portachiavi su Windows**: Credential Manager accetta al massimo 2560 byte per voce, mentre la sessione Supabase
  (JWT + refresh token + dati utente) li supera. Il comando Rust divide il valore in pezzi (`<chiave>#0`, `#1`, … più
  una voce con il numero di pezzi) e li ricompone; la rimozione cancella tutti i pezzi.
- **supabase-js nella webview**: usa `fetch` e `WebSocket` nativi di WebView2 (Windows) e WKWebView (macOS), senza
  polyfill. Origine della pagina: `http://tauri.localhost` su Windows, `http://localhost:14321` su macOS installato.
- **Deep link**: su Windows in `tauri dev` lo schema si registra a runtime (`register_all()`); nell'app installata lo
  registra l'installer. Su macOS funziona solo con l'app impacchettata (`.app`), non in `tauri dev`.

## 9. Passi da fare tu

Nessuno di questi valori va incollato in chat né committato.

### 9.1 Progetto Supabase (regione UE)
1. <https://supabase.com/dashboard> → **New project**.
2. Region: **Central EU (Frankfurt)**. Piano Free. Scegli una password del DB robusta e salvala nel tuo gestore di
   password (non serve all'app).
3. **Project Settings › API**: annota il **Project URL** e la **Publishable key** (`sb_publishable_…`; in progetti
   vecchi la `anon` key). **Non** usare mai la *secret key* / `service_role`.
4. **Realtime › Settings**: disattiva **Allow public access** (solo canali privati).
5. **Authentication › Sign In / Providers**: lascia disattivati i provider che non usi (email/password compreso, se
   vuoi solo Google).

### 9.2 Client OAuth Google e schermata di consenso
1. <https://console.cloud.google.com> → crea un progetto (es. "personalDashboard").
2. **Google Auth Platform › Branding**: nome dell'app, email di supporto (la tua), dominio autorizzato
   `supabase.co`.
3. **Audience**: tipo **External**, stato di pubblicazione **Testing**.
4. **Data Access**: solo gli scope base `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`. Non
   aggiungerne altri.
5. **Clients › Create client**: tipo **Web application**.
   - Authorized redirect URI: `https://<ref-progetto>.supabase.co/auth/v1/callback` (lo trovi anche in Supabase,
     nella pagina del provider Google).
6. Annota **Client ID** e **Client secret**.

**Modalità Testing e amici** (regole attuali di Google):
- In Testing puoi aggiungere fino a **100 utenti di test** (Audience › Test users); di norma solo loro possono
  accedere e le loro autorizzazioni **scadono dopo 7 giorni**.
- **Eccezione**: se l'app chiede **solo** `openid`, `email` e `profile` (il nostro caso), gli utenti non devono
  essere nella lista, non vedono l'avviso "app non verificata" e le autorizzazioni non scadono dopo 7 giorni. Basta
  aggiungere qualunque altro scope per perdere l'eccezione.
- Per stare tranquilli: aggiungi comunque gli amici come **test users** (la loro email Google) — non costa nulla e
  copre il caso in cui Google cambi regole.
- Le app non verificate hanno un tetto di **100 nuovi utenti in tutta la vita del progetto** (non si azzera).
- Pubblicare in Production non è necessario per un gruppo di amici; con soli scope base non richiede verifica.

### 9.3 Secret di Google solo in Supabase
**Authentication › Sign In / Providers › Google**: abilita, incolla **Client ID** e **Client secret**. Il secret
esiste solo lì: mai nel repo, mai nell'app, mai in `.env`.

### 9.4 URL di redirect
**Authentication › URL Configuration**:
- **Site URL**: `personaldashboard://auth/callback`.
- **Redirect URLs**: **solo** `personaldashboard://auth/callback`. Niente wildcard.

### 9.5 `.env.local` (sul tuo PC, mai committato)
Copia `.env.example` (verrà creato in Fase 1) in `.env.local` nella radice del progetto e compila:
```
VITE_SUPABASE_URL=https://<ref-progetto>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key>
```
`.env.*` è già in `.gitignore` (eccetto `.env.example`). Senza questo file l'app funziona in solo locale.

### 9.6 GitHub Actions Secrets (per le release)
Repository → **Settings › Secrets and variables › Actions › New repository secret**:
- `SUPABASE_URL` — il Project URL;
- `SUPABASE_PUBLISHABLE_KEY` — la publishable key.

Il workflow `release.yml` li passerà come `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` nell'`env` dello step
`tauri-action` (che esegue `npm run build`). Senza secret la release esce in solo locale.

### 9.7 Applicare le migrazioni al progetto
Dopo la Fase 1, dalla radice del repo:
```
npx supabase login          # apre il browser; il token resta nel tuo profilo, non nel repo
npx supabase link --project-ref <ref-progetto>
npx supabase db push
```
Mai modifiche allo schema dal pannello: solo migrazioni. Ogni migrazione nuova (es. `…_visto.sql` della Fase 4,
`…_modifica_gruppo.sql` della Fase 5b, `…_pixy.sql` della 5c) va applicata di nuovo con `npx supabase db push`.

## 10. Fasi

| Fase | Contenuto |
|---|---|
| 0 | Verifiche e questo documento |
| 1 | `.gitignore`, `.env.example`, migrazioni, test pgTAP (`npx supabase test db`, Docker) |
| 2 | Login Google: deep link, single-instance, PKCE, portachiavi, nome utente, logout, elimina account, scheda Account |
| 3 | Sincronizzazione dei totali (`device_id`, 14 giorni, backoff) + script `.mts` |
| 4 | Presenza in tempo reale (payload v1, orologio, impostazione materia) + script `.mts` |
| 5 | 5a Pixy in `core/pixy`; 5b widget Gruppi, finestre, stati, impostazioni della stanza (+ `update_group`); 5c Stanza comune con i Pixy sincronizzati |
| 6 | CSP, aggiornamento di `CLAUDE.md` e `ARCHITETTURA.md` (ricetta "Aggiungere un modulo social"), controllo segreti |
