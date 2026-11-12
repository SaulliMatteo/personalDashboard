/**
 * Su che sistema gira l'app, per le poche cose che cambiano davvero su Android (aprire un file,
 * mostrarlo in una cartella…). Va letto solo nei file di piattaforma (es. `widgets/notes/data/filesApi.ts`),
 * mai con controlli sparsi nei componenti.
 */
export function isAndroid(): boolean {
  // lo user agent della WebView di Android contiene "Android" (e anche "Linux")
  return typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);
}

/** macOS (WKWebView): Cmd al posto di Ctrl nelle scorciatoie e nei loro testi. */
export function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return /mac/i.test(nav.userAgentData?.platform ?? navigator.platform ?? "");
}

/** Il tasto delle scorciatoie da scrivere nei testi: "⌘" su macOS, "Ctrl" altrove. */
export function modKeyLabel(): string {
  return isMac() ? "⌘" : "Ctrl";
}
