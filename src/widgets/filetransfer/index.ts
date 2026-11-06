import type { WidgetDefinition } from "../../core/widgets/types";
import { SIZE_S, SIZE_W, SIZE_M } from "../../core/widgets/sizes";
import FileTransferWidget from "./FileTransferWidget";
import FileTransferDetail from "./FileTransferDetail";
import FileTransferMini from "./mini/FileTransferMini";
import { FileTransferProvider } from "./FileTransferContext";
import FileSendDetail from "./FileSendDetail";
import { FileSendProvider } from "./FileSendContext";
import { FT_SENDER } from "./data/fileSendApi";

export const fileTransferWidget: WidgetDefinition = {
  id: "filetransfer",
  name: "File Transfer",
  // Sul desktop riceve (server C); su Android, dove il server non c'è, invia al PC come la pagina dell'iPad.
  description: FT_SENDER
    ? "Invia file dal telefono al PC via Wi-Fi: scrivi una volta l'indirizzo del PC e scegli i file."
    : "Ricevi file dall'iPad via Wi-Fi: avvia il server, scansiona il QR e sfoglia i file ricevuti.",
  component: FileTransferWidget,
  sizes: [SIZE_S, SIZE_W, SIZE_M],
  defaultPlacement: { x: 2, y: 1, w: 1, h: 1 },
  detailComponent: FT_SENDER ? FileSendDetail : FileTransferDetail,
  mini: FileTransferMini,
  // Lo stato del server (o degli invii) deve restare allineato anche fuori dalla dashboard.
  provider: FT_SENDER ? FileSendProvider : FileTransferProvider,
};
