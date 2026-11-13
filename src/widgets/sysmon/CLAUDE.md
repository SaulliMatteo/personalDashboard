# Monitor di sistema

Backend in `src-tauri/src/system_monitor/`, frontend qui. Prove: `node scripts/sysmon/metrics.test.mts` (dopo il bundle
con rolldown: scelta delle metriche, storico dei 60 s, forma che entra nella cella) e
`cd src-tauri && cargo test --lib system_monitor` (unità e "non disponibile → None").

- Legge solo l'hardware di questo computer, **senza driver né amministratore** (niente WinRing0/LibreHardwareMonitor:
  Defender li segnala) e **niente temperatura CPU su Windows** (servirebbe un driver: `cpuTempReason: "windows"`).
- Windows: sysinfo + PDH (`GPU Engine`, aggregato come Gestione attività: massimo tra i tipi di engine della somma) +
  D3DKMT (nome, VRAM, temperatura/ventola/consumo della GPU) + IOCTL sul disco aperto con accesso 0 (temperatura SSD).
  macOS: sysinfo `component` e `gpu` (codice non compilabile da Windows: lo prova solo la CI o un Mac).
- Ogni campo è `Option`: un dato che manca è `null` e la UI mostra "—", mai 0.
- Un solo thread (`sysmon`) che gira solo con iscritti (`sysmon_subscribe/unsubscribe`, contatori widget/dettaglio;
  processi completi e CPU per thread solo col dettaglio) e manda l'evento `sysmon:snapshot`; si ferma in `shutdown`
  (chiusura, `RunEvent::Exit`, `updater_prepare_install`). Il provider si iscrive solo con un `useSysmonFeed` montato e
  la finestra visibile; lo storico dei grafici (60 s) sta solo in memoria.
- Scelta delle metriche (`sysmonMetrics`) e intervallo (`sysmonInterval`) sono in `PER_DEVICE_SETTINGS`. Su Android e
  nel browser (`SYSMON_AVAILABLE` falso) il widget mostra solo il messaggio e non chiama nessun comando.
- Le celle cambiano con la finestra: la forma del widget la sceglie `lib/fit.ts` dallo spazio misurato (forma del
  mockup, poi righe "etichetta valore", poi senza intestazione, poi meno metriche), mai testi schiacciati.
- Su Windows l'elenco delle reti di sysinfo contiene anche i filtri NDIS ("Ethernet-QoS Packet Scheduler-0000"…): si
  scartano (`units::is_filter_instance`), altrimenti il traffico si conta più volte.
