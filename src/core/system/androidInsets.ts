/**
 * Barre di sistema e tastiera su Android come variabili CSS su <html>: `--android-inset-top|right|bottom|left`
 * e `--android-ime` (px CSS). Le misure le manda MainActivity.kt (src-tauri/gen/android), perché la WebView in
 * `env(safe-area-inset-*)` riporta solo il foro della fotocamera. I componenti non le leggono direttamente:
 * usano `--safe-*` e `--keyboard` di styles/base.css (e `:root[data-keyboard]` con la tastiera aperta). Sul desktop non arriva niente e restano a 0.
 */
interface AndroidInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
  ime: number;
}

declare global {
  interface Window {
    /** Ponte di MainActivity.kt: solo la lettura dell'ultima misura, in JSON. */
    __pdInsets?: { get(): string };
  }
}

function valid(value: unknown): value is AndroidInsets {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return ["top", "right", "bottom", "left", "ime"].every((k) => typeof v[k] === "number" && Number.isFinite(v[k]) && (v[k] as number) >= 0);
}

function apply(insets: unknown) {
  if (!valid(insets)) return;
  const style = document.documentElement.style;
  style.setProperty("--android-inset-top", `${insets.top}px`);
  style.setProperty("--android-inset-right", `${insets.right}px`);
  style.setProperty("--android-inset-bottom", `${insets.bottom}px`);
  style.setProperty("--android-inset-left", `${insets.left}px`);
  style.setProperty("--android-ime", `${insets.ime}px`);
  // data-keyboard: tastiera aperta, per le viste che cambiano forma (es. la Stanza comune lascia solo la chat)
  if (insets.ime > 0) document.documentElement.dataset.keyboard = "";
  else delete document.documentElement.dataset.keyboard;
}

/** Da chiamare una volta all'avvio, prima del primo render. */
export function installAndroidInsets(): void {
  window.addEventListener("pd-insets", (event) => apply((event as CustomEvent<unknown>).detail));
  try {
    const raw = window.__pdInsets?.get();
    if (raw) apply(JSON.parse(raw));
  } catch {
    // niente ponte (desktop, browser): restano gli env() del CSS
  }
}
