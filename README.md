
## Scaricare e installare

Gli installer sono nella pagina **[Releases](../../releases/latest)** del repository: scegli l'ultima versione e
scarica il file per il tuo sistema.

### Windows (10 o 11)

1. Scarica il file `…-setup.exe` (oppure il `.msi`).
2. Aprilo e segui l'installazione.
3. L'app non è firmata con un certificato a pagamento, quindi Windows potrebbe mostrare "Windows ha protetto il PC":
   clicca **Ulteriori informazioni** › **Esegui comunque**.

### macOS (11 o successivo, Intel e Apple Silicon)

1. Scarica il file `.dmg`, aprilo e trascina l'app in **Applicazioni**.
2. L'app non è firmata da Apple, quindi al primo avvio macOS la blocca. Per sbloccarla, una volta sola:
   1. prova ad aprirla e chiudi l'avviso;
   2. vai in **Impostazioni di Sistema** › **Privacy e sicurezza** e, in fondo, clicca **Apri comunque**, poi conferma.
3. Se macOS dice che l'app "è danneggiata", apri il Terminale ed esegui:

   ```bash
   xattr -cr /Applications/personaldashboard.app
   ```

Al primo avvio del File Transfer, consenti le connessioni in entrata quando il firewall lo chiede. Su macOS la porta
5000 è occupata da AirPlay: l'app ne sceglie da sola un'altra e te la mostra nella pagina del widget.

### Aggiornamenti

Dalla versione che include gli aggiornamenti automatici in poi, l'app si aggiorna da sola quando glielo chiedi:

1. apri **Impostazioni** › **Generale** › **Versione e aggiornamenti** (lì vedi anche la versione installata);
2. premi **Controlla aggiornamenti**: se c'è una versione nuova compaiono il numero e le note della release;
3. premi **Aggiorna**: l'app scarica il pacchetto, controlla la firma, lo installa e si riavvia. Su Windows compare
   per un attimo la finestra dell'installer (con il `.msi` Windows può chiedere il permesso di amministratore).

L'app non controlla gli aggiornamenti da sola all'avvio: va in internet solo quando premi il pulsante. I pacchetti
vengono dalle Release di questo repository e sono firmati: un pacchetto con una firma diversa viene rifiutato.
I tuoi dati restano dove sono.

Dalle versioni precedenti (o se preferisci farlo a mano): scarica e installa la nuova versione sopra la vecchia,
i dati restano.

## I tuoi dati e la privacy

- Tutto ciò che crei (sessioni di studio, note, video salvati, impostazioni) sta in un file sul tuo computer:
  - **Windows**: `%APPDATA%\it.matteo.personalDashboard\dashboard.db`
  - **macOS**: `~/Library/Application Support/it.matteo.personalDashboard/dashboard.db`

  Per fare un backup basta copiare quel file con l'app chiusa.
- L'app usa internet solo per quello che attivi tu:
  - il **Meteo**, se imposti una città (dati di [Open-Meteo](https://open-meteo.com));
  - i **video di YouTube**, quando li guardi;
  - i **Gruppi**, solo se accedi con Google;
  - gli **aggiornamenti**, solo quando premi "Controlla aggiornamenti" o "Aggiorna" (Release di GitHub).
- **Gruppi**: gli altri membri vedono solo il tuo nome utente, se stai studiando o sei in pausa e il tempo totale di
  studio per giorno. Email e nome Google non vengono mai mostrati; sessioni, note e video restano sul tuo computer.
  La materia che studi e le espressioni di Pixy si condividono solo se le attivi. Dalle impostazioni puoi uscire o
  eliminare l'account in qualsiasi momento.

## Disinstallare

- **Windows**: Impostazioni › App › Personal Dashboard › Disinstalla.
- **macOS**: trascina l'app da Applicazioni nel Cestino.

Per cancellare anche i dati, elimina la cartella indicata sopra.

## Compilare dal codice

Servono [Node.js](https://nodejs.org) (LTS), [Rust](https://rustup.rs) e i
[prerequisiti di Tauri v2](https://v2.tauri.app/start/prerequisites/) per il tuo sistema.

```bash
npm install
npm run tauri dev      # avvia l'app in sviluppo
npm run tauri build    # crea l'installer per il tuo sistema
```

Senza configurazione i Gruppi restano disattivati ("Gruppi non configurati") e tutto il resto funziona normalmente.

`npm run tauri build` crea anche i pacchetti firmati per gli aggiornamenti, quindi vuole una chiave di firma nella
variabile `TAURI_SIGNING_PRIVATE_KEY` (generala con `npx tauri signer generate` e metti la sua chiave pubblica in
`plugins.updater.pubkey` di `src-tauri/tauri.conf.json`). Per una build personale senza aggiornamenti, togli invece
`"createUpdaterArtifacts": true` da quel file.

## Licenza

[MIT](LICENSE)
