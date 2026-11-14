# Progetto: comandi, verifica, convenzioni

Dashboard personale **local-first** per desktop e Android: Tauri v2 + React 19 + Vite + TypeScript + Tailwind v4,
dati in SQLite locale (`@tauri-apps/plugin-sql`, file `dashboard.db`). Codice, commenti e UI sono in **italiano**.
Il `README.md` è per chi scarica l'app (installazione, dati, privacy), non per chi sviluppa: le note per lo sviluppo
stanno nel `CLAUDE.md` (regole e indice) e in queste guide. `docs/mockup/` e `docs/STORIA.md` sono solo locali
(`.gitignore`), come `CLAUDE.local.md`.

## Comandi

```bash
npm install
npm run tauri dev      # sviluppo (finestra Tauri, compila anche Rust e C)
npm run tauri build    # installer
npm run build          # tsc -b + vite build: è il controllo dei tipi
npm run lint           # oxlint (plugin react/typescript/oxc, vedi .oxlintrc.json); ~600 avvisi già noti
                       # (quasi tutti della pagina iPad impacchettata): il controllo è "nessun avviso nuovo"
cd src-tauri && cargo check   # dopo modifiche a Rust o C
```

Servono Node (LTS), Rust e i prerequisiti di Tauri v2 per il sistema. Android: `docs/ANDROID.md`.

## Verifica e prove

Non c'è un test runner né la CI di test: si verifica con `npm run build` + `npm run lint` (+ `cargo check`), più le
prove dell'area toccata. Sono script `.mts` lanciati con `node` (Node 24 toglie i tipi da solo); se importano file
senza estensione, prima un bundle con `npx rolldown`:

```bash
npx rolldown scripts/gruppi/chat.test.mts --file node_modules/.tmp/gruppi-chat.test.mjs --platform node
node node_modules/.tmp/gruppi-chat.test.mjs
```

| Se tocchi | Prova |
|---|---|
| `social/`, `core/cloud/`, `supabase/` | `scripts/gruppi/<modulo>.test.mts` (chat, presence, room, leaderboard, friends, chatCards, sync, subjects, todo, pixy); pgTAP se tocchi il server |
| `core/sync/` o una tabella sincronizzata | `scripts/sync/records.test.mts`, `schema.test.mts` (SQLite vero, migrazioni da zero), `round.test.mts` |
| `widgets/notes/sync/filePlan.ts` | `scripts/sync/files.test.mts` |
| `widgets/youtube/lib/recommender.ts` | `scripts/youtube/recommender.test.mts` |
| `core/layout/mobileLayout.ts` | `scripts/layout/mobileLayout.test.mts` |
| `widgets/study/timer/phases.ts` | `scripts/study/phases.test.mts` |
| `widgets/study/lib/` | `scripts/studio/` (piano settimanale, Prospettiva) |
| `core/notify/inbox.ts` | `scripts/notify/inbox.test.mts` |
| Monitor di sistema | `scripts/sysmon/metrics.test.mts` e `cd src-tauri && cargo test --lib system_monitor` |
| `widgets/screentime/lib/`, `src-tauri/src/screen_time/` | `scripts/screentime/siteFromTitle.test.mts`, `logic.test.mts` e `cd src-tauri && cargo test --lib screen_time` |
| `src-tauri/src/file_transfer.rs` | `cd src-tauri && cargo test --lib file_transfer` |

```bash
# Server dei Gruppi (Supabase locale, serve Docker): migrazioni in supabase/migrations/, test pgTAP in
# supabase/tests/database/ (helper condivisi in _aiuti.psql)
npx supabase start
npx supabase db reset      # riapplica le migrazioni da zero
npx supabase test db       # tutti i file pgTAP
```

Su Windows le porte 5432x di Supabase locale possono cadere nell'intervallo riservato da `winnat` ("bind forbidden"):
`net stop winnat` + `net start winnat` da amministratore.
Le logiche "pure" (es. `widgets/companion/engine/`, `core/pixy/engine/`, `widgets/youtube/lib/watchTracker.ts`,
`core/layout/compactor.ts`) hanno orologio e random iniettati apposta per essere provate senza browser.

## Convenzioni e insidie generali

- Valori "ultimi" in interval/listener di lunga durata → `core/hooks/useLatestRef.ts`.
- Contesti: `XContext.tsx` esporta solo il provider; contesto, tipo e hook in `useX.ts` (es. `useSettings.ts`).
- Testi con "Ctrl": `modKeyLabel()` di `core/system/platform.ts`. Click sui link esterni: `core/system/externalLinks.ts`.
- `tauri` e diversi plugin sono pinnati a versioni esatte (le successive vogliono `tauri ^2.12`): non aggiornarli
  senza leggere `docs/BACKEND.md`.
- I file sono UTF-8; PowerShell 5.1 con `Get-Content` mostra le accentate storte anche se sono corrette.
- Negli script Node, `String.replace` con una stringa che contiene `$` interpreta `` $` `` e `$&`: per testo
  letterale si passa una funzione (`replace(x, () => testo)`). È così che `docs/ARCHITETTURA.md` si era rovinato.
- Debito noto: `widgets/youtube/screens/WatchScreen.tsx` importa `study/data/studyRepository.ts` — non replicarlo.

Convenzioni di architettura (dati, registry, dipendenze): `docs/ARCHITETTURA.md`. Griglia della dashboard e singoli
widget: `docs/WIDGET.md`.
