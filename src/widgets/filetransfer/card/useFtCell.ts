import { useThemeVariant } from "../../../core/theme/variants";
import { useFileTransfer } from "../useFileTransfer";
import { ROLE_TEXT, STATUS_LABELS } from "../lib/labels";

/** Dati comuni delle celle 1×1 (una forma per tema, vedi cards.ts). */
export function useFtCell() {
  const { role, ready, running, error, files } = useFileTransfer();
  const text = ROLE_TEXT[role];
  const [onLabel, offLabel] = useThemeVariant(STATUS_LABELS);
  const failed = error !== null;
  const total = files.length;
  const count = failed ? "!" : ready ? String(total) : "–";
  const state = running ? "online" : text.off;

  let ariaLabel = `File transfer: ${total} ${text.countLong}, ${state}`;
  if (failed) ariaLabel = `File transfer: errore, ${state}`;
  else if (!ready) ariaLabel = "File transfer: caricamento";

  return {
    text,
    running,
    failed,
    count,
    /** Server acceso, elenco letto e nessun file ricevuto. */
    empty: ready && !failed && total === 0,
    statusLabel: running ? onLabel : offLabel,
    ariaLabel,
    errorTitle: error ?? undefined,
    onlineClass: running ? " is-online" : "",
  };
}

export type FtCellData = ReturnType<typeof useFtCell>;
