import { Channel, invoke } from "@tauri-apps/api/core";
import { basename } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { getMeta, setMeta } from "../../../core/db/meta";
import { isAndroid } from "../../../core/system/platform";

/**
 * File Transfer dalla parte di chi invia: il telefono manda i file al server del PC (src-tauri/src/file_send.rs).
 * Sul desktop il widget riceve (fileTransferApi.ts), su Android invia: la scelta sta solo qui.
 */
export const FT_SENDER = isAndroid();

/** Indirizzo del PC ("ip:porta") scritto l'ultima volta, nei metadati dell'app. */
const ADDRESS_KEY = "filetransfer.sendAddress";

export interface SendProgress {
  sent: number;
  total: number;
}

export interface PickedFile {
  /** URI `content://` del selettore di Android. */
  path: string;
  name: string;
}

export const loadSendAddress = () => getMeta(ADDRESS_KEY);
export const saveSendAddress = (address: string) => setMeta(ADDRESS_KEY, address);

/** Il PC risponde all'indirizzo? Un indirizzo non valido è un errore, uno irraggiungibile è `false`. */
export const checkTarget = (address: string) => invoke<boolean>("ft_check_target", { address });

/** Manda un file; restituisce il nome con cui il PC l'ha salvato. */
export function sendFile(address: string, file: PickedFile, onProgress: (p: SendProgress) => void): Promise<string> {
  const channel = new Channel<SendProgress>();
  channel.onmessage = onProgress;
  return invoke<string>("ft_send_file", { address, path: file.path, name: file.name, onProgress: channel });
}

/** Selettore di sistema, più file insieme; vuoto se l'utente annulla. */
export async function pickFiles(): Promise<PickedFile[]> {
  const picked = await open({ multiple: true, directory: false });
  const paths = picked === null ? [] : Array.isArray(picked) ? picked : [picked];
  return Promise.all(paths.map(async (path) => ({ path, name: await pickedName(path) })));
}

/** Il nome vero (con l'estensione) di un URI `content://` lo sa solo il sistema. */
async function pickedName(path: string): Promise<string> {
  try {
    return await basename(path);
  } catch {
    const tail = decodeURIComponent(path).split(/[/\\:]/).pop();
    return tail || "file";
  }
}
