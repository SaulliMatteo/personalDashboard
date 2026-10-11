# Personal Dashboard

Dashboard personale **local-first**: desktop (Tauri v2) con React 19, Vite, TypeScript e SQLite locale.
Pensata per crescere: ogni widget, impostazione e tabella si aggiunge in un punto solo.

## Avvio

```bash
npm install
npm run tauri dev      # sviluppo (finestra Tauri)
npm run tauri build    # installer
npm run build          # solo controllo TypeScript + bundle web
npm run lint
```

Servono Node, Rust e i prerequisiti di Tauri v2 per il tuo sistema.
Nota: le notifiche di sistema mostrano il nome dell'app solo nella versione **installata**
(`tauri build`); in `tauri dev` Windows le attribuisce a PowerShell.

## Documentazione

- [docs/ARCHITETTURA.md](docs/ARCHITETTURA.md) — struttura delle cartelle, regole di dipendenza e ricette
  ("come aggiungo un widget / un'impostazione / una colonna al DB / cambio il design").
