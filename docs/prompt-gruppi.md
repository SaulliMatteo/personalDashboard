# Prompt per Claude Code — Gruppi v1.1 (Stanza comune, pagina Gruppi, report per materie, widget)

Continui il lavoro sulla funzione Gruppi di `personalDashboard`. La v1 funziona online. Restano valide **tutte** le regole
di `CLAUDE.md`, di `docs/GRUPPI.md` e del prompt originale: sicurezza (RLS, RPC, niente segreti nel repo), migrazioni
solo in fondo, 8 versioni dei temi, rete solo da `core/cloud`, stop alla fine di ogni fase.
**Se non sei sicuro di qualcosa, fermati e chiedi: non indovinare.**

Lavora su un branch nuovo da `dev` (es. `feat/gruppi-v1.1`).

## Fonte di verità per la grafica

I mockup sono stati **aggiornati**: li metto io in `docs/design/temi/gruppi/` (sostituiscono quelli di prima; leggi il
`README.md` della cartella). Ogni file contiene le 8 versioni (4 temi × chiaro/scuro), da scegliere con il selettore in
basso a destra. **Ogni schermata è finita solo quando è uguale al mockup in tutte e 8 le versioni.** Se il codice e il
mockup non concordano, vale il mockup; se qualcosa non è replicabile, dimmelo invece di inventare.

---

## Le 4 richieste

### 1. La Stanza comune non deve scorrere (`stanza-comune.html`)
- La pagina sta tutta nella finestra: **nessuno scorrimento verticale** di `.main` in questa vista (oggi `.main` di
  `AppShell` è l'unico elemento che scorre: per questa vista va disattivato, senza toccare le altre).
- La sala **si ridimensiona** per stare nello spazio disponibile mantenendo le proporzioni (scala uniforme, come nel
  mockup), usando `core/hooks/useElementSize.ts`. Niente barre di scorrimento orizzontali dentro la sala.
- Ciò che non ci sta scorre **dentro il proprio riquadro** (solo la lista Membri), mai la pagina.
- Verifica a 1280×800, 1024×700 e 1920×1080 in tutte e 8 le versioni. Se sotto una certa dimensione non c'è modo di
  stare senza scorrimento, proponimi la soglia e il comportamento invece di decidere da solo.

### 2. Colonna destra della Stanza comune: Membri, Messaggi, Da fare
- **Membri**: lista divisa in "In questa sala", "Nelle altre sale" (con "Sala N"), "Fuori dalla stanza" (sostituisce la
  vecchia striscia in basso, che va tolta). Ogni riga: pallino di stato, nome, timer o "pausa mm:ss" o "visto…".
- **Dettagli**: il vecchio pannello laterale sparisce. Cliccando una riga **o un posto nella sala**, quella riga si apre
  e mostra sessione in corso, materia (solo se condivisa), oggi e settimana; un secondo clic la chiude. Posto e riga
  sono sincronizzati (stessa selezione). Riga = `<button aria-expanded>`, accessibile da tastiera.
- **Messaggi** e **Da fare**: solo **segnaposto** "In arrivo", non interattivi. **Nessun backend, nessuna tabella,
  nessun codice di chat o di lista** in questo giro.

### 3. Il dettaglio del widget diventa la pagina "Gruppi" (`impostazioni-stanza.html`)
Si apre dal dettaglio del widget e dal pulsante Impostazioni della Stanza comune (in quel caso con il gruppo corrente
già selezionato).

- **A sinistra**: voce "Cosa vedono gli altri", poi "I tuoi gruppi" (nome, numero di membri, "proprietario" se lo sei),
  poi i pulsanti Crea / Entra (aprono le finestre già esistenti).
- **"Cosa vedono gli altri"** (impostazioni generali, valgono per tutti i gruppi):
  - "Mostra la materia che sto studiando" (quella già esistente, spenta di default);
  - **nuova** "Includi le mie materie nei report dei gruppi", **spenta di default** (vedi punto 3b);
  - il riquadro informativo su cosa vedono sempre gli altri.
- **Gruppo selezionato**: nome e ruolo, poi **schede** Gruppo | Classifica | Report (`role="tablist"`).
  - **Gruppo**:
    - codice invito **nascosto di default** (`••••-••••`) con pulsante a occhio mostra/nascondi (`aria-label` e
      `aria-pressed`); "Copia" funziona anche quando è nascosto; "Rigenera" solo per il proprietario;
    - nome e descrizione modificabili solo dal proprietario (per gli altri in sola lettura, con la nota);
    - membri con "Proprietario" e rimozione (solo proprietario);
    - "Abbandona il gruppo" in fondo, con il testo che cambia se sei proprietario (passaggio al più anziano) o no.
  - **Classifica**: Oggi / Settimana / Mese, con barre. Il mese si basa sui totali giornalieri già sincronizzati:
    per chi è entrato da poco è parziale, va bene così ma deve essere chiaro (niente zeri finti).
  - **Report**: vedi 3b.
- Lo stato "codice visibile" non si salva: a ogni apertura il codice è nascosto.

### 3b. Report del gruppo per materie (la parte nuova con dati online)
Deve essere **come il report di Studio** (`widgets/study/detail/ReportTab.tsx`): Settimana / Mese / Anno con frecce,
barre impilate per materia, legenda con i totali; ma **sommato su tutti i membri**. Esempio: io 1 h di Analisi, un amico
1 h di Analisi e 1 h di Elettronica ⇒ Analisi 2 h, Elettronica 1 h. Riusa `core/report/periods.ts`, non duplicarlo.

**Unire le materie di persone diverse** ("Analisi", "analisi 1", "Analisi 2" devono poter finire insieme):
- Ogni gruppo ha un elenco di **materie del gruppo**. Ogni membro **abbina** le proprie materie a quelle del gruppo.
- L'abbinamento è **proposto in automatico** e **confermato o corretto a mano** dall'utente (sezione "Le tue materie in
  questo gruppo" nella scheda Report, come nel mockup): select con le materie del gruppo, "Non condividere" e "Nuova
  materia del gruppo…", pulsante Conferma. **Non si conferma mai niente in automatico.**
- Proposta = funzione **pura** con test `.mts`: normalizza (minuscole, spazi, accenti, punteggiatura, numeri arabi o
  romani finali: "Analisi 2" → "analisi") e cerca la materia del gruppo con lo stesso nome normalizzato; se non c'è,
  la più simile sopra una soglia (proponimi quale misura e soglia); altrimenti nessuna proposta. Casi di test minimi:
  "Analisi 2"→"Analisi", "analisi1"→"Analisi", "Fisica I"→"Fisica", "Fisica tecnica" ≠ "Fisica" (nessuna proposta
  automatica o proposta da confermare: dimmi come la gestisci), "Inglese" senza corrispondenti → nessuna proposta.
- **Consenso e privacy**: entra nel report solo il tempo delle materie **abbinate e confermate**, e solo se
  l'interruttore "Includi le mie materie nei report dei gruppi" è acceso. Tutto il resto del tempo dell'utente compare
  come **"Altre materie"** (calcolato come totale giornaliero già condiviso meno la parte abbinata). **I nomi delle
  materie locali non escono mai dal dispositivo**: al server arriva solo "materia del gruppo X: N secondi".
- **Revoca**: se l'utente spegne l'interruttore, toglie un abbinamento o abbandona il gruppo, i suoi dati per materia
  in quel gruppo vengono **cancellati dal server** (non solo nascosti).

**Dati (backend)** — proponimi lo schema prima di scriverlo, seguendo il modello nucleo + moduli:
- `group_subjects`: materie del gruppo (nome ≤ 40, unico per gruppo sul nome normalizzato, colore come indice di
  palette, autore, data). Proponimi chi può crearle (io direi: ogni membro crea, solo il proprietario rinomina, unisce
  ed elimina), con un limite per gruppo (es. 50) e un limite di frequenza.
- Abbinamenti utente → materia del gruppo. Attenzione: gli id delle materie locali sono **per dispositivo** (SQLite) e
  in futuro ci sarà il mobile. Proponimi una chiave che non dipenda dal dispositivo e che non mandi al server il nome
  della materia locale (es. abbinamento salvato **in locale** e al server solo i totali per materia del gruppo).
- Totali giornalieri per materia del gruppo: utente, dispositivo, gruppo, materia del gruppo, giorno, secondi
  (`CHECK 0..86400`), con somma per giorno di un utente ≤ il suo totale giornaliero. Stesso meccanismo idempotente
  della Fase 3 (ricalcolo dal locale + upsert), stessi 14 giorni al primo invio.
- RLS su tutto, con le funzioni di appartenenza già esistenti: leggono solo i membri del gruppo; ognuno scrive solo
  le proprie righe; la materia del gruppo deve appartenere allo stesso gruppo della riga. Le operazioni sensibili
  (creare, rinominare, unire, eliminare una materia; revoca) passano da RPC con `SECURITY DEFINER` e
  `SET search_path = ''`.
- **Test pgTAP** nuovi per tutto questo (non-membro non legge, nessuno scrive righe altrui, materia di un altro gruppo
  rifiutata, revoca che cancella, limiti di lunghezza e numero), più la prova che i test sanno fallire come nella
  Fase 1. Migrazioni **nuove in fondo**, mai modificare quelle già applicate.

### 4. Widget grande (L): solo classifica (`widget.html`)
- Togli lo spazio "Messaggi": la taglia L è **solo classifica**, con barre e selettore Oggi / Settimana.
- Il titolo oggi va a capo parola per parola: trova la **causa** (probabilmente un contenitore flex senza
  `min-width: 0`) e correggila; titolo e sottotitolo stanno su **una riga**, con i puntini se non ci stanno. Controlla
  che lo stesso difetto non ci sia nelle altre taglie e negli altri widget.

---

## Fasi (fermati alla fine di ognuna, riepilogo con cosa hai verificato e come)

**Fase A: Stanza comune e widget (solo interfaccia).** Punti 1, 2 e 4. Nessuna modifica a backend o dati.

**Fase B: pagina Gruppi con i dati già esistenti.** Punto 3 tranne il report per materie: navigazione, impostazioni
generali (con il nuovo interruttore già presente ma senza effetto finché non c'è la Fase C, e scritto così), scheda
Gruppo, scheda Classifica. Nella scheda Report, per ora, solo il riquadro "in arrivo".

**Fase C0: proposta (niente codice).** Schema, regole, chiave degli abbinamenti, algoritmo di proposta con misura e
soglia, flusso di revoca, cosa cambia in `docs/GRUPPI.md`. Aspetta la mia approvazione.

**Fase C: report per materie.** Migrazioni + test pgTAP verdi (con la prova che sanno fallire) → sincronizzazione →
interfaccia del report e degli abbinamenti. Dimmi quando è il momento di fare `npx supabase db push` (lo faccio io,
solo dopo i test verdi).

## Verifica (per ogni fase)
- `npm run build`, `npm run lint`, `cargo check` se tocchi Rust; `npx supabase test db` dalla Fase C; script `.mts`.
- **Le 8 versioni**: elenca le 8 combinazioni e per ciascuna cosa hai controllato a mano (confronto con il mockup).
- Stanza comune: nessuno scorrimento alle tre dimensioni di finestra indicate.
- Accessibilità: schede, righe espandibili e occhio del codice usabili da tastiera, stato mai solo col colore.
- Prima di ogni commit: `git diff --cached` e il controllo dei segreti (§3.5 del prompt originale).
- Aggiorna `docs/GRUPPI.md` (cosa è cambiato, nuove tabelle, nuova impostazione, cosa resta segnaposto).