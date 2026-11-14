# CLAUDE.md

Dashboard personale **local-first** per desktop e Android: Tauri v2 + React 19 + Vite + TypeScript + Tailwind v4,
dati in SQLite locale (`dashboard.db`). Codice, commenti e UI sono in **italiano**.

Questo file ha solo le regole che valgono sempre e l'indice. Il resto sta nelle guide di `docs/`.

## Come si lavora

1. **Prima di iniziare** leggi le guide dell'area che tocchi (tabella sotto). Se il lavoro tocca più aree, leggile
   tutte; se non sai quale, parti da `docs/ARCHITETTURA.md`.
2. **Dopo un cambiamento significativo** (funzione nuova, regola o insidia scoperta, comando, tabella, dominio di
   rete, difesa di sicurezza, decisione presa con l'utente) aggiorna la guida giusta nello stesso lavoro. Le guide
   descrivono com'è il codice adesso, non la storia. Se nessuna guida è adatta, aggiungi una sezione a quella più
   vicina e, se serve un file nuovo, mettilo anche in questo indice.

## Regole

- Se non sei sicuro chiedi sempre conferme e chiarimenti, non cercare di indovinare a caso.
- Nessuna risorsa caricata da internet a runtime (font compresi). Le poche eccezioni, tutte opzionali (Meteo,
  YouTube, Gruppi, aggiornamenti), e come aggiungerne una: `docs/SICUREZZA.md`.
- Le difese di sicurezza non si tolgono e non si allargano (CSP, capability, `is_app_url`, controlli del server di
  File Transfer, `sanitizeHtml`, RLS): `docs/SICUREZZA.md`. Segreti mai nel repo.
- I mockup approvati in `docs/mockup/` (solo locali) sono la fonte di verità per la grafica: se codice e mockup non
  concordano, vale il mockup.
- Ogni colore viene dai token del tema: niente esadecimali nei componenti (eccezione: colori scelti dall'utente).
- Ogni nuovo widget funziona nei 4 temi (Notte, Opaco, Quaderno, Fosforo), giorno e notte, e ha una taglia 1×1.
- SQL solo nei `*Repository.ts`; migrazioni solo aggiunte in fondo, mai modificare una migrazione rilasciata.
- Un widget non importa un altro widget; `social` non importa i widget; la rete dei Gruppi passa solo da `core/cloud/`.
- Git: si lavora su `dev`, PR verso `main`.

## Comandi

```bash
npm run tauri dev             # sviluppo
npm run build                 # tsc -b + vite build: è il controllo dei tipi
npm run lint                  # oxlint: il controllo è "nessun avviso nuovo"
cd src-tauri && cargo check   # dopo modifiche a Rust o C
```

Non c'è un test runner: si verifica con build + lint (+ `cargo check`) e con le prove dell'area toccata
(`docs/PROGETTO.md`, tabella "Se tocchi → Prova").

## Guide (`docs/`)

| Se il lavoro riguarda | Leggi |
|---|---|
| Comandi, prove da lanciare, convenzioni e insidie generali | `docs/PROGETTO.md` |
| Avvio, registry, dipendenze tra cartelle, dati e migrazioni, impostazioni, ricette | `docs/ARCHITETTURA.md` |
| Rete, CSP, comandi e capability, HTML non fidato, File Transfer, sessione, server, audit | `docs/SICUREZZA.md` |
| Temi, token, varianti, pigmenti, mockup | `docs/TEMI.md` |
| Telefono e tocco (layout compatto, fogli, pressione lunga, editor del Quaderno) | `docs/MOBILE.md` |
| Android: build, APK firmato, plugin nativi, `MainActivity` | `docs/ANDROID.md` |
| Backend nativo (`src-tauri/`), macOS, aggiornamenti, release, versioni pinnate | `docs/BACKEND.md` |
| Sync tra dispositivi (righe e file) | `docs/SYNC.md` |
| Gruppi, Amici, chat e schede, presenza, schema e passi su Supabase | `docs/GRUPPI.md` |
| Notifiche e timer dello Studio | `docs/NOTIFICHE.md` |
| Griglia della dashboard, Monitor di sistema, Tempo al PC, File Transfer, Lavagna | `docs/WIDGET.md` |

Solo in locale (non nel repo): `docs/mockup/` (`temi/`, `mobile/`, `gruppi/`, `widget/`), `docs/STORIA.md`
(cronologia delle fasi chiuse, da leggere solo se serve sapere perché una cosa è stata fatta così) e
`CLAUDE.local.md` (setup della macchina e lavoro in corso).
