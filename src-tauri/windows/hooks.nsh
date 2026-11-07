; Passaggi aggiunti all'installer NSIS di Tauri (bundle.windows.nsis.installerHooks in tauri.conf.json).

; Dopo un'installazione o un aggiornamento app.exe è un file nuovo, ma Explorer tiene in cache la vecchia icona:
; l'app fissata sulla barra delle applicazioni restava un quadrato bianco. SHCNE_ASSOCCHANGED (0x08000000) con
; SHCNF_IDLIST (0) gli fa ridisegnare le icone, come `ie4uinit.exe -show`.
!macro NSIS_HOOK_POSTINSTALL
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
