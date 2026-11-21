import { openUrl } from "@tauri-apps/plugin-opener";

/** Apre un link di una proprietà nel browser di sistema (mai nella finestra dell'app). Solo http(s) e mailto. */
export async function openExternalLink(url: string): Promise<void> {
  if (!/^(https?:|mailto:)/i.test(url)) throw new Error("Link non ammesso");
  await openUrl(url);
}
