import type { WidgetDefinition } from "../../core/widgets/types";
import { SIZE_S, SIZE_W, SIZE_M } from "../../core/widgets/sizes";
import FileTransferWidget from "./FileTransferWidget";
import FileTransferDetail from "./FileTransferDetail";
import FileTransferMini from "./mini/FileTransferMini";
import { FileTransferProvider } from "./FileTransferContext";

export const fileTransferWidget: WidgetDefinition = {
  id: "filetransfer",
  name: "File Transfer",
  description: "Ricevi file dall'iPad via Wi-Fi: avvia il server, scansiona il QR e sfoglia i file ricevuti.",
  component: FileTransferWidget,
  sizes: [SIZE_S, SIZE_W, SIZE_M],
  defaultPlacement: { x: 2, y: 1, w: 1, h: 1 },
  detailComponent: FileTransferDetail,
  mini: FileTransferMini,
  // Lo stato del server deve restare allineato anche fuori dalla dashboard.
  provider: FileTransferProvider,
};
