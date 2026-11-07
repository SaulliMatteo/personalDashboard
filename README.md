
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

**Gruppi su macOS dalla 1.0.10.** Fino alla 1.0.9, a ogni versione nuova macOS chiedeva la password del portachiavi
("personaldashboard vuole usare i dati riservati… nel portachiavi"), e se la richiesta veniva annullata si usciva
dai Gruppi. Dalla 1.0.10 su Mac la sessione dei Gruppi non sta più nel portachiavi ma in un file privato dell'app
(`~/Library/Application Support/it.matteo.personalDashboard/sessione/`, leggibile solo dal tuo utente) e la
richiesta non compare più. Dopo il passaggio alla 1.0.10 bisogna **rientrare nei Gruppi con Google una volta**.
Se vuoi, puoi eliminare le voci vecchie: apri **Accesso Portachiavi**, cerca `it.matteo.personalDashboard` ed elimina
le voci `gruppi-auth…`.

Al primo avvio del File Transfer, consenti le connessioni in entrata quando il firewall lo chiede. Su macOS la porta
5000 è occupata da AirPlay: l'app ne sceglie da sola un'altra e te la mostra nella pagina del widget.

### Android (7 o successivo)

L'APK per Android non è nelle Releases: lo compila chi lo usa (vedi [Compilare dal codice](#compilare-dal-codice)).

1. Copia `app-universal-release.apk` sul telefono (cavo, Drive, email…) e aprilo.
2. Android chiede di consentire l'installazione di **app sconosciute** per l'app con cui l'hai aperto (es. Files):
   consentila, poi installa.
3. Notifiche del timer: al primo avvio dello Studio l'app chiede il permesso (Android 13 e successivi).
4. Su alcuni telefoni (OPPO/ColorOS, Xiaomi, Huawei…) il sistema chiude le app in sfondo e cancella le notifiche
   programmate: nelle impostazioni dell'app consenti l'**attività in background** e l'**avvio automatico**, e nelle
   app recenti blocca personalDashboard (lucchetto). Se chiudi l'app forzatamente o riavvii il telefono, le notifiche
   del timer tornano alla prossima apertura.

### Aggiornamenti

Dalla versione che include gli aggiornamenti automatici in poi, l'app si aggiorna da sola quando glielo chiedi:

1. apri **Impostazioni** › **Generale** › **Versione e aggiornamenti** (lì vedi anche la versione installata);
2. premi **Controlla aggiornamenti**: se c'è una versione nuova compaiono il numero e le note della release;
3. premi **Aggiorna**: l'app scarica il pacchetto, controlla la firma, lo installa e si riavvia. Su Windows compare
   per un attimo la finestra dell'installer (con il `.msi` Windows può chiedere il permesso di amministratore).

In più, una volta al giorno l'app guarda da sola se c'è una versione nuova e, se c'è, te lo dice nella campanella in
alto nella dashboard. Legge solo il numero della versione: scarica e installa soltanto quando premi **Aggiorna**. Il
controllo automatico si spegne in **Impostazioni** › **Generale** › **Versione e aggiornamenti**. I pacchetti
vengono dalle Release di questo repository e sono firmati: un pacchetto con una firma diversa viene rifiutato.
I tuoi dati restano dove sono.

Dalle versioni precedenti (o se preferisci farlo a mano): scarica e installa la nuova versione sopra la vecchia,
i dati restano.

Su Android gli aggiornamenti dall'app non ci sono: si installa l'APK nuovo sopra il vecchio. Deve avere una versione
più alta ed essere firmato con la **stessa chiave**, altrimenti Android rifiuta l'aggiornamento (e disinstallare per
reinstallare cancella i dati: esportali prima).

## I tuoi dati e la privacy

- Tutto ciò che crei (sessioni di studio, note, video salvati, impostazioni) sta in un file sul tuo computer:
  - **Windows**: `%APPDATA%\it.matteo.personalDashboard\dashboard.db`
  - **macOS**: `~/Library/Application Support/it.matteo.personalDashboard/dashboard.db`

  - **Android**: nei dati privati dell'app (non si raggiunge a mano).

  Per fare un backup, in **Impostazioni › Generale › Dati** premi **Esporta**: salva tutto in un file `.db` dove
  scegli tu. **Importa** rimette i dati da un file esportato (anche da un altro dispositivo, es. dal PC al telefono)
  e sostituisce quelli presenti. Sul computer basta anche copiare il file con l'app chiusa. Gli allegati delle note
  sono file a parte (cartella `Documenti/Notes`) e non entrano nel backup.
  Su Android c'è anche il backup automatico di Google (se attivo nel telefono): salva solo questo database.
- **Stessi dati sul PC e sul telefono** (facoltativo): accedi ai Gruppi con lo stesso account Google su tutti e
  due e accendi **Impostazioni › Account › I miei dispositivi › Sincronizza i miei dati** su ciascuno. Viaggiano
  studio, note, raccolte (con allegati, immagini e PDF fino a 50 MB l'uno) e impostazioni; aspetto, suoni e
  disposizione restano di ogni dispositivo. Se due dispositivi cambiano la stessa cosa vince l'ultima modifica.
  I dati passano dal servizio online dei Gruppi e li vedi solo tu, nemmeno i membri dei tuoi gruppi. Non è un
  backup: una cancellazione arriva anche sugli altri dispositivi.
- L'app usa internet solo per quello che attivi tu:
  - il **Meteo**, se imposti una città (dati di [Open-Meteo](https://open-meteo.com));
  - i **video di YouTube**, quando li guardi;
  - i **Gruppi**, solo se accedi con Google (e il sync dei tuoi dati, solo se lo accendi);
  - gli **aggiornamenti** (Release di GitHub): il numero dell'ultima versione una volta al giorno, se non spegni il
    controllo automatico, o quando premi "Controlla aggiornamenti"; il pacchetto solo quando premi "Aggiorna".
- **Gruppi**: gli altri membri vedono solo il tuo nome utente, se stai studiando o sei in pausa e il tempo totale di
  studio per giorno. Email e nome Google non vengono mai mostrati; sessioni, note e video restano sul tuo computer (o, col sync acceso, solo nel tuo spazio privato).
  La materia che studi e le espressioni di Pixy si condividono solo se le attivi. Dalle impostazioni puoi uscire o
  eliminare l'account in qualsiasi momento.

## Disinstallare

- **Windows**: Impostazioni › App › Personal Dashboard › Disinstalla.
- **macOS**: trascina l'app da Applicazioni nel Cestino.
- **Android**: tieni premuta l'icona › Informazioni app › Disinstalla. **Su Android disinstallare cancella tutti i
  dati, note e allegati compresi**: esportali prima.

Per cancellare anche i dati sul computer, elimina la cartella indicata sopra.

## Compilare dal codice

Servono [Node.js](https://nodejs.org) (LTS), [Rust](https://rustup.rs) e i
[prerequisiti di Tauri v2](https://v2.tauri.app/start/prerequisites/) per il tuo sistema.

```bash
npm install
npm run tauri dev      # avvia l'app in sviluppo
npm run tauri build    # crea l'installer per il tuo sistema
```

**Android** (da Windows, macOS o Linux): servono anche Android Studio (SDK e NDK), le variabili `ANDROID_HOME`,
`NDK_HOME` e `JAVA_HOME` (JDK 21 o 23) e una chiave di firma tua, creata una volta sola:

```bash
keytool -genkeypair -v -keystore <cartella fuori dal progetto>/personaldashboard.jks -alias personaldashboard -keyalg RSA -keysize 2048 -validity 10950
```

Poi crea `src-tauri/gen/android/keystore.properties` (è ignorato da git):

```properties
storeFile=<cartella fuori dal progetto>/personaldashboard.jks
keyAlias=personaldashboard
storePassword=<password>
keyPassword=<password>
```

(le due password si possono anche lasciare fuori dal file e mettere nelle variabili `PD_STORE_PASSWORD` e
`PD_KEY_PASSWORD`). Infine `npm run android:release` crea
`src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk` (telefoni arm64).
**Fai una copia della chiave e delle password** (gestore di password + una copia offline): senza, l'app installata
non si può più aggiornare. Per ogni aggiornamento alza `version` in `src-tauri/tauri.conf.json`.

Senza configurazione i Gruppi restano disattivati ("Gruppi non configurati") e tutto il resto funziona normalmente.

`npm run tauri build` crea anche i pacchetti firmati per gli aggiornamenti, quindi vuole una chiave di firma nella
variabile `TAURI_SIGNING_PRIVATE_KEY` (generala con `npx tauri signer generate` e metti la sua chiave pubblica in
`plugins.updater.pubkey` di `src-tauri/tauri.conf.json`). Per una build personale senza aggiornamenti, togli invece
`"createUpdaterArtifacts": true` da quel file.

## Licenza

[MIT](LICENSE)
