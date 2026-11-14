# Notifiche e timer dello Studio

I file senza cartella stanno in `src/core/notify/`.

- Tutte da `notifier.ts` (`sendAppNotification` con un `kind`), mai dal plugin direttamente.
- Ognuna finisce anche nella campanella della dashboard (`inbox.ts`, tabella locale `app_notifications`, ultime 200
  per 30 giorni, prova `node scripts/notify/inbox.test.mts`); gli avvisi minori, senza notifica di sistema, ci vanno
  con `postInAppNotification`; `inbox: false` la manda solo come notifica di sistema (i messaggi di testo degli amici).
- Il clic apre `open` con `openNotification` di `useNav` (`{ type: "friends" }` apre il pannello degli amici con
  `requestFriendsPanel` di `core/nav/friendsPanel.ts`, perché il pannello sta in `social`).
- Il Companion registra un decoratore che le firma Pixy (faccia nello stile del tema, emoji, frase della personalità,
  `widgets/companion/notify/`); su Windows il toast con l'immagine lo mostra il comando `notify_with_image`
  (`notifyApi.ts` → `src-tauri/src/notify.rs`), altrove si ripiega sul plugin senza immagine.

## Android

- Un canale per tipo (`CHANNEL_OF`). Il tocco apre la vista di `open`, scritta nell'ultima cifra dell'id: il plugin al
  tocco non riporta altro; `MainActivity.kt` legge l'id dall'intent e lo passa a `core/system/androidTaps.ts`, anche
  all'avvio a freddo. Una vista nuova va in fondo a `OPEN_TARGETS`.
- Ciò che deve arrivare ad app congelata o chiusa si pianifica con `scheduleAppNotifications(gruppo, elenco)`
  (AlarmManager esatto, `USE_EXACT_ALARM` nel manifest; la chiusura forzata e il riavvio del telefono cancellano gli
  allarmi, li rimette la prossima apertura). Sul desktop la pianificazione non c'è (il plugin mostrerebbe subito).

## Timer dello Studio

Lo stato è fatto di istanti (`runningSince`), le fine fase le calcola `widgets/study/timer/phases.ts` (puro, prova
`node scripts/study/phases.test.mts`): al rientro si chiudono tutte le fasi finite nel frattempo, all'ora vera, e su
Android le prossime sono già pianificate come notifiche (il tick JS è congelato a schermo spento).
