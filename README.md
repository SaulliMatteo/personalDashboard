# Personal Dashboard

Una dashboard personale per lo studio, per **Windows** e **macOS**. Raccoglie in un'unica finestra il timer di studio,
le note, i video da guardare, il meteo e un piccolo compagno animato, tutto disposto come preferisci.

**Local-first**: i tuoi dati restano sul tuo computer, in un database locale. Niente account obbligatori, niente
pubblicità, niente tracciamento.

## Cosa c'è dentro

| Widget | A cosa serve |
|---|---|
| **Studio** | Timer pomodoro o cronometro, tempo di studio per materia e report per settimana, mese e anno |
| **Notes** | Note in cartelle, con editor a pagine e scrittura a mano |
| **YouTube** | Salva in cartelle i video da guardare per lo studio, riproducili e prendi appunti a tempo |
| **Pixy** | Un compagno a LED che cambia espressione con quello che fai: studio, pause, video, ora del giorno |
| **File Transfer** | Ricevi file dall'iPad via Wi-Fi: scansioni un QR e li mandi |
| **Meteo** | Temperatura e cielo nella tua città |
| **Orario** e **Giorno** | L'ora e la data, grandi e leggibili |
| **Gruppi** (facoltativo) | Studia con gli amici: chi sta studiando adesso, una stanza comune e la classifica |

Ogni widget si può aggiungere, spostare e ridimensionare sulla griglia; con un doppio clic si apre la sua pagina
completa. Ci sono **4 temi** (Notte, Opaco, Quaderno, Fosforo), ognuno con la variante giorno e notte, che può seguire
quella del sistema.

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

### Aggiornare

Scarica e installa la nuova versione sopra la vecchia: i tuoi dati restano.
Su Android l'APK nuovo deve avere una versione più alta ed essere firmato con la **stessa chiave**: altrimenti Android
rifiuta l'aggiornamento, e disinstallare per reinstallare cancella i dati (esportali prima).

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
- L'app usa internet solo per quello che attivi tu:
  - il **Meteo**, se imposti una città (dati di [Open-Meteo](https://open-meteo.com));
  - i **video di YouTube**, quando li guardi;
  - i **Gruppi**, solo se accedi con Google.
- **Gruppi**: gli altri membri vedono solo il tuo nome utente, se stai studiando o sei in pausa e il tempo totale di
  studio per giorno. Email e nome Google non vengono mai mostrati; sessioni, note e video restano sul tuo computer.
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

## Licenza

[MIT](LICENSE)
