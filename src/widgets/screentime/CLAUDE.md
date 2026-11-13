# Tempo al PC

Backend in `src-tauri/src/screen_time/` (registratore) e `src-tauri/src/app_tray.rs` (icona vicino all'orologio,
avvio col computer), frontend qui. Mockup: `docs/design/temi/tempo-pc.html`. Prove (dopo il bundle con rolldown):
`scripts/screentime/siteFromTitle.test.mts` (sito dal titolo, classificazione) e `logic.test.mts` (ore e mezzanotte,
focus e serie, limiti, pause e sessioni, settimana, etichette delle date); `cd src-tauri && cargo test --lib screen_time`
(segmenti).

- **Privacy**: il titolo della finestra esce dal Rust solo verso il frontend, serve a `lib/siteFromTitle.ts` e poi si
  butta. Nel DB vanno solo app, nome del sito, categoria e secondi. Non loggare titoli e non salvarli in `meta`.
- **Perché in Rust**: con la finestra nascosta la WebView rallenta i timer JS (fino a uno al minuto). Il thread
  `screentime` campiona ogni 2 s (stesse letture di Pixy, `companion.rs`) e tiene i segmenti; il provider li ritira
  ogni 30 s (`screentime_take`), su `visibilitychange` e prima di uscire (`core/system/beforeQuit.ts`).
- **Avvio e stop del registratore stanno nello stesso effetto e passano dalla stessa coda** (`queueRef` in
  `ScreenTimeContext.tsx`): con StrictMode, se solo lo stop passava dalla coda, al Rust arrivavano avvio, avvio, stop e
  il registratore restava spento.
- Catena di un segmento: `lib/classify.ts` (app con `classifyApp` + correzioni manuali `companionAppCategories`,
  condivise con Pixy; sito dal titolo solo per i browser e solo se il titolo non è vuoto; la dashboard stessa è
  `__self`; schermata di blocco = via dal PC) → `lib/aggregate.ts` (spezza su ore e mezzanotte; l'inattività conta
  solo in video/musica/chiamate) → `screentime_usage` (`seconds += ?`).
- Tabelle (migrazione 27): `screentime_usage` (giorno × ora × app × sito), `screentime_sessions` (tempo continuo al PC,
  una pausa ≥ 5 min la chiude), `screentime_limits`. **Non sincronizzate**: sono dati di questo computer (viaggiano solo
  con Esporta/Importa). Si tengono 400 giorni, pulizia una volta al giorno (`screentime_pruned_day` in `meta`).
- Limiti: avviso all'80 % (facoltativo) e al 100 %, una volta al giorno per limite (`screentime_limit_notices` in
  `meta`). Pausa: promemoria ogni `screentimeBreakMinutes` di tempo continuo. Notifiche firmate da Pixy.
- Focus/svago: classe per categoria (`lib/focus.ts`, `screentimeFocusClasses`; vuota = default), editor nella pagina
  (Settimana). Tutte le impostazioni sono in `PER_DEVICE_SETTINGS` e `systemSignals`.
- Pagina (`ScreenTimeDetail.tsx` + `detail/`): `usePeriodData` legge il giorno o la settimana dal DB e per oggi usa le
  righe del provider; si rilegge a ogni `revision` (una categoria cambiata a mano si vede anche nei giorni passati). Il
  giorno di oggi viene da `now` del contesto, non da `Date.now()` nel render (lint `purity`).
- Su Android, Linux e nel browser il widget mostra solo il messaggio "solo Windows e macOS" e non chiama comandi. Su
  macOS il titolo è vuoto: niente siti, solo app.
- La X che nasconde la finestra (`closeToTray`, default sì) e "Avvia con il computer" stanno in Impostazioni ›
  Generale › Finestra e avvio (`features/settings/tabs/WindowSection.tsx`); il collegamento col Rust è
  `core/system/useAppWindowBridge.ts`.
