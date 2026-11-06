/**
 * Su che sistema gira l'app, per le poche cose che cambiano davvero su Android (aprire un file,
 * mostrarlo in una cartella…). Va letto solo nei file di piattaforma (es. `widgets/notes/data/filesApi.ts`),
 * mai con controlli sparsi nei componenti.
 */
export function isAndroid(): boolean {
  // lo user agent della WebView di Android contiene "Android" (e anche "Linux")
  return typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);
}
