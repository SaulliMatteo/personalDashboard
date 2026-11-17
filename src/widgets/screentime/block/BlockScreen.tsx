import { createElement, useEffect, useState } from "react";
import { resolveVariant } from "../../../core/theme/variants";
import { isThemeId, THEME_MODES, type Pigment, type ThemeMode } from "../../../core/theme/themes";
import { SCREENTIME_RINGS } from "../card/cards";
import { LockIcon } from "../components/parts";
import { closeBlockedApp, currentBlock, extendBlock, onBlockChanged, openDashboardFromBlock, type BlockShown } from "../data/screentimeApi";
import { formatDuration } from "../lib/format";
import "../ScreenTimeWidget.css";
import "./BlockScreen.css";

const isMode = (v: string): v is ThemeMode => (THEME_MODES as readonly string[]).includes(v);

/** "per Opera", "per la categoria Giochi": il nome del limite dopo "Hai finito il tempo". */
function forWhat(shown: BlockShown): string {
  return shown.kind === "app" ? `per ${shown.label}` : `per la categoria ${shown.label}`;
}

/**
 * Schermata di blocco (docs/mockup/widget/tempo-blocco.html), nella finestra "blocco" che il Rust mette sopra l'app
 * finita (src-tauri/src/screen_block.rs). Niente DB né impostazioni: quello da mostrare, tema compreso, lo dà il Rust
 * (`screenblock_current`), che lo riceve dalla finestra principale. I pulsanti fanno solo tre cose: chiedere all'app
 * di chiudersi, "Altri 15 minuti" (una volta al giorno per limite) e aprire la dashboard.
 */
export default function BlockScreen({ pigment }: { pigment: Pigment }) {
  const [shown, setShown] = useState<BlockShown | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      void currentBlock().then(
        (next) => alive && setShown(next),
        (error) => console.error("Blocco: lettura non riuscita", error)
      );
    load();
    const unlisten = onBlockChanged(load);
    window.addEventListener("focus", load);
    return () => {
      alive = false;
      void unlisten.then((fn) => fn());
      window.removeEventListener("focus", load);
    };
  }, []);

  const theme = shown && isThemeId(shown.theme) ? shown.theme : "notte";
  const mode = shown && isMode(shown.mode) ? shown.mode : "notte";
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.mode = mode;
  }, [theme, mode]);

  if (!shown) return <div className="stk" />;

  const Ring = resolveVariant(SCREENTIME_RINGS, theme, mode);
  const run = (action: () => Promise<unknown>) => () => {
    if (busy) return;
    setBusy(true);
    void action()
      .catch((error) => console.error("Blocco: azione non riuscita", error))
      .finally(() => setBusy(false));
  };
  const used = `Oggi ${formatDuration(shown.usedSeconds)} su ${formatDuration(shown.maxSeconds)}.`;

  return (
    <div className="stk" data-pigment={pigment} role="dialog" aria-labelledby="stk-title">
      <div className="stk-panel">
        <span className="stk-kicker">Tempo allo schermo</span>
        {createElement(
          Ring,
          { parts: [{ cls: "warn", value: 1 }], label: "Tempo finito" },
          <LockIcon className="stk-lockicon" />,
          <span className="stk-ringtime">{formatDuration(shown.maxSeconds)}</span>
        )}
        <h2 id="stk-title">Hai finito il tempo {forWhat(shown)}</h2>
        <p>
          {used}
          {shown.canExtend ? " Si sblocca a mezzanotte." : ""}
        </p>
        {!shown.canExtend && <p className="stk-used">I 15 minuti in più di oggi li hai già usati. Si sblocca a mezzanotte.</p>}
        <div className="stk-actions">
          <button type="button" className="stk-btn stk-btn--primary" disabled={busy} onClick={run(closeBlockedApp)}>
            Chiudi {shown.app}
          </button>
          {shown.canExtend && (
            <button type="button" className="stk-btn stk-btn--ghost" disabled={busy} onClick={run(extendBlock)}>
              Altri 15 minuti
              <small>una volta al giorno</small>
            </button>
          )}
        </div>
        <button type="button" className="stk-link" disabled={busy} onClick={run(openDashboardFromBlock)}>
          Apri la dashboard
        </button>
      </div>
    </div>
  );
}
