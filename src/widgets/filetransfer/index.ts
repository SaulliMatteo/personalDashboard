import type { WidgetDefinition } from "../../core/widgets/types";
import { SIZE_S, SIZE_M_WIDE, SIZE_M_SQUARE } from "../../core/widgets/sizes";
import FileTransferWidget from "./FileTransferWidget";
import FileTransferDetail from "./FileTransferDetail";
import { FileTransferProvider } from "./FileTransferContext";

export const fileTransferWidget: WidgetDefinition = {
  id: "filetransfer",
  name: "File Transfer",
  description: "Ricevi file dall'iPad via Wi-Fi: avvia il server, scansiona il QR e sfoglia i file ricevuti.",
  component: FileTransferWidget,
  sizes: [SIZE_M_WIDE, SIZE_S, SIZE_M_SQUARE],
  defaultPlacement: { x: 2, y: 2, w: 2, h: 1 },
  detailComponent: FileTransferDetail,
  // Lo stato del server deve restare allineato anche fuori dalla dashboard.
  provider: FileTransferProvider,
};
