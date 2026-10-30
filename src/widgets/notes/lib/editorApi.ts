import type { ShortcutAction } from "./shortcuts";

export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * Quello che un editor aperto (un riquadro) offre alla pagina Notes: le scorciatoie e il
 * trascinamento di file dal sistema, che Tauri manda alla finestra intera (NotesDetail).
 */
export interface EditorApi {
  /** Esegue una scorciatoia; false = non riguarda questo editor. */
  action: (action: ShortcutAction) => boolean;
  /** Il trascinamento è sopra la finestra: l'editor mostra il pannello se il punto è sulla sua pagina. */
  dragOver: (point: ScreenPoint | null, count: number) => void;
  /** File rilasciati: true se il punto era sulla pagina di questo editor (e li ha gestiti). */
  drop: (paths: string[], point: ScreenPoint) => Promise<boolean>;
}

/** File salvati nella cartella della nota: nome finale (può avere " (2)") e dimensione. */
export interface StoredFile {
  name: string;
  size: number;
}
