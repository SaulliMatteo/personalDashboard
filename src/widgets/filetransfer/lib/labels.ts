import type { ThemeVariants } from "../../../core/theme/variants";

/** Etichette di stato del server: in Fosforo sono quelle di un interruttore hardware (mockup). */
export const STATUS_LABELS: ThemeVariants<[string, string]> = {
  notte: ["Online", "Offline"],
  opaco: ["Online", "Offline"],
  quaderno: ["Online", "Offline"],
  fosforo: ["On", "Off"],
};

/** Testi che cambiano tra chi riceve (desktop, server acceso/spento) e chi invia (Android, PC raggiungibile o no). */
export const ROLE_TEXT = {
  receiver: {
    count: "ricevuti",
    countLong: "file ricevuti",
    countOne: "file ricevuto",
    off: "server spento",
    offShort: "Server fermo",
    none: "ancora nessun file",
    empty: "I file inviati dal dispositivo appariranno qui.",
  },
  sender: {
    count: "inviati",
    countLong: "file inviati",
    countOne: "file inviato",
    off: "PC non collegato",
    offShort: "PC non impostato",
    none: "ancora nessun invio",
    empty: "I file che invii al PC appariranno qui.",
  },
} as const;
