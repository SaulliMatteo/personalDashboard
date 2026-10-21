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

## Scaricare l'app

Gli installer si trovano nelle **Release** del repository (sezione a destra su GitHub):

- **Windows**: `.msi` oppure `-setup.exe`.
- **macOS** (11 o successivo, Intel e Apple Silicon): `.dmg`. Apri il `.dmg` e trascina l'app in Applicazioni.

L'app per macOS non è firmata da Apple, quindi al primo avvio macOS la blocca. Per sbloccarla una volta:

1. Prova ad aprirla, chiudi l'avviso.
2. Impostazioni di Sistema › Privacy e sicurezza › in fondo "Apri comunque", poi conferma.

Se macOS dice che l'app "è danneggiata", da Terminale:

```bash
xattr -cr /Applications/personaldashboard.app
```

Su macOS, al primo avvio del File Transfer, consenti le connessioni in entrata quando il firewall lo chiede.
La porta 5000 è usata da AirPlay: l'app ne sceglie da sola un'altra e la mostra nella pagina del widget.

### Pubblicare una nuova versione

Il workflow `.github/workflows/release.yml` compila `.dmg` (universale) e installer Windows:
aggiorna `version` in `src-tauri/tauri.conf.json`, poi `git tag v0.1.0 && git push --tags`
(oppure Actions › Release › Run workflow). Finito, pubblica la Release creata in bozza.
Il build per macOS si può fare solo su un Mac o in CI, non da Windows.

## Documentazione

- [docs/ARCHITETTURA.md](docs/ARCHITETTURA.md) — struttura delle cartelle, regole di dipendenza e ricette
  ("come aggiungo un widget / un'impostazione / una colonna al DB / cambio il design").
