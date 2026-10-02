import { useEffect, useState } from "react";

interface ConfirmButtonProps {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  className?: string;
}

/**
 * Pulsante a doppio click per azioni distruttive: il primo click lo
 * "arma" per 3 secondi, il secondo esegue. (window.confirm non è
 * affidabile in tutte le webview di Tauri.)
 */
function ConfirmButton({ label, confirmLabel = "Sicuro? Clicca di nuovo", onConfirm, className = "" }: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 3000);
    return () => window.clearTimeout(t);
  }, [armed]);

  return (
    <button
      type="button"
      className={`${className}${armed ? " is-armed" : ""}`}
      onClick={() => {
        if (armed) {
          setArmed(false);
          void onConfirm();
        } else {
          setArmed(true);
        }
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}

export default ConfirmButton;
