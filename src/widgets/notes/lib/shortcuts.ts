/**
 * Scorciatoie delle Notes: UNICO elenco (azione → tasti). Lo usano il gestore della tastiera,
 * i tooltip, le legende dei tasti in Fosforo e il pannello delle scorciatoie.
 *
 * Regole per le tastiere non inglesi (italiana compresa):
 * - le cifre si riconoscono dal tasto fisico (`code`), perché Shift+8 scrive "(";
 * - Ctrl+Alt su Windows è anche AltGr (es. AltGr+ò = "@"): se il tasto scrive un simbolo non scatta nulla;
 * - Ctrl+/ vale solo dove "/" non richiede Shift; sulla tastiera italiana c'è F1.
 * Su macOS Ctrl diventa Cmd.
 */

export type ShortcutAction =
  | "undo"
  | "redo"
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "link"
  | "h1"
  | "h2"
  | "h3"
  | "paragraph"
  | "bullets"
  | "numbers"
  | "checklist"
  | "toggleCheck"
  | "indent"
  | "outdent"
  | "duplicate"
  | "table"
  | "code"
  | "moveUp"
  | "moveDown"
  | "find"
  | "findAll"
  | "newNote"
  | "prevPage"
  | "nextPage"
  | "zoomIn"
  | "zoomOut"
  | "zoomReset"
  | "pen"
  | "highlighter"
  | "eraser"
  | "textMode"
  | "help"
  | "escape";

interface Combo {
  /** Tasto fisico (KeyboardEvent.code), per cifre e tasti speciali. */
  code?: string;
  /** Carattere (KeyboardEvent.key, minuscolo), per le lettere. */
  key?: string;
  /** Ctrl (Cmd su macOS). */
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** Solo su macOS / solo fuori da macOS. */
  mac?: boolean;
}

export type ShortcutGroup = "Modifica" | "Testo" | "Tabelle" | "Navigazione" | "Scrittura a mano";

interface ShortcutDef {
  label: string;
  group: ShortcutGroup;
  combos: Combo[];
  /** Come scriverla nel pannello e nei tooltip (prima combinazione se manca). */
  display?: string[];
}

const digit = (n: number) => [{ code: `Digit${n}` }, { code: `Numpad${n}` }];

export const SHORTCUTS: Record<ShortcutAction, ShortcutDef> = {
  undo: { label: "Annulla", group: "Modifica", combos: [{ key: "z", mod: true }] },
  redo: {
    label: "Ripeti",
    group: "Modifica",
    combos: [{ key: "z", mod: true, shift: true }, { key: "y", mod: true, mac: false }],
  },
  duplicate: { label: "Duplica il blocco", group: "Modifica", combos: [{ key: "d", mod: true }] },
  moveUp: { label: "Sposta il blocco su", group: "Modifica", combos: [{ code: "ArrowUp", alt: true }] },
  moveDown: { label: "Sposta il blocco giù", group: "Modifica", combos: [{ code: "ArrowDown", alt: true }] },

  bold: { label: "Grassetto", group: "Testo", combos: [{ key: "b", mod: true }] },
  italic: { label: "Corsivo", group: "Testo", combos: [{ key: "i", mod: true }] },
  underline: { label: "Sottolineato", group: "Testo", combos: [{ key: "u", mod: true }] },
  strike: { label: "Barrato", group: "Testo", combos: [{ key: "x", mod: true, shift: true }] },
  link: { label: "Link", group: "Testo", combos: [{ key: "k", mod: true }] },
  h1: { label: "Titolo 1", group: "Testo", combos: digit(1).map((c) => ({ ...c, mod: true, alt: true })) },
  h2: { label: "Titolo 2", group: "Testo", combos: digit(2).map((c) => ({ ...c, mod: true, alt: true })) },
  h3: { label: "Titolo 3", group: "Testo", combos: digit(3).map((c) => ({ ...c, mod: true, alt: true })) },
  paragraph: { label: "Testo normale", group: "Testo", combos: digit(0).map((c) => ({ ...c, mod: true, alt: true })) },
  bullets: { label: "Elenco puntato", group: "Testo", combos: [{ code: "Digit8", mod: true, shift: true }] },
  numbers: { label: "Elenco numerato", group: "Testo", combos: [{ code: "Digit7", mod: true, shift: true }] },
  checklist: { label: "Checklist", group: "Testo", combos: [{ code: "Digit9", mod: true, shift: true }] },
  toggleCheck: {
    label: "Spunta la riga",
    group: "Testo",
    combos: [{ code: "Enter", mod: true }, { code: "NumpadEnter", mod: true }],
  },

  // Li gestisce la pagina (PageSurface: paragrafi, liste, checklist, tabelle); qui stanno per il pannello e i tooltip.
  indent: { label: "Aumenta il rientro (nelle tabelle: cella dopo)", group: "Testo", combos: [{ code: "Tab" }] },
  outdent: { label: "Riduci il rientro (nelle tabelle: cella prima)", group: "Testo", combos: [{ code: "Tab", shift: true }] },

  table: { label: "Nuova tabella", group: "Tabelle", combos: [{ key: "t", mod: true, alt: true }] },
  code: { label: "Blocco di codice", group: "Testo", combos: [{ key: "c", mod: true, alt: true }] },

  find: { label: "Cerca nella nota", group: "Navigazione", combos: [{ key: "f", mod: true }] },
  findAll: { label: "Cerca in tutte le note", group: "Navigazione", combos: [{ key: "f", mod: true, shift: true }] },
  newNote: { label: "Nuova nota", group: "Navigazione", combos: [{ key: "n", mod: true }] },
  prevPage: { label: "Pagina precedente", group: "Navigazione", combos: [{ code: "PageUp", mod: true }] },
  nextPage: { label: "Pagina successiva", group: "Navigazione", combos: [{ code: "PageDown", mod: true }] },
  zoomIn: {
    label: "Zoom avanti",
    group: "Navigazione",
    combos: [{ key: "+", mod: true }, { key: "=", mod: true }, { key: "+", mod: true, shift: true }, { code: "NumpadAdd", mod: true }],
  },
  zoomOut: { label: "Zoom indietro", group: "Navigazione", combos: [{ key: "-", mod: true }, { code: "NumpadSubtract", mod: true }] },
  zoomReset: { label: "Zoom al 100%", group: "Navigazione", combos: [...digit(0).map((c) => ({ ...c, mod: true }))] },
  help: {
    label: "Pannello delle scorciatoie",
    group: "Navigazione",
    combos: [{ key: "/", mod: true }, { code: "F1" }],
    display: ["Ctrl", "/"],
  },
  escape: { label: "Chiudi, deseleziona", group: "Navigazione", combos: [{ code: "Escape" }] },

  pen: { label: "Penna", group: "Scrittura a mano", combos: [{ key: "p" }] },
  highlighter: { label: "Evidenziatore", group: "Scrittura a mano", combos: [{ key: "h" }] },
  eraser: { label: "Gomma", group: "Scrittura a mano", combos: [{ key: "e" }] },
  textMode: { label: "Torna al testo", group: "Scrittura a mano", combos: [{ key: "t" }] },
};

/** Azioni delle lettere senza modificatori: valgono solo in modalità disegno. */
export const INK_ACTIONS: ReadonlySet<ShortcutAction> = new Set(["pen", "highlighter", "eraser", "textMode"]);

export function isMacPlatform(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform ?? navigator.platform ?? "";
  return /mac/i.test(platform);
}

export interface KeyLike {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  getModifierState?: (key: string) => boolean;
}

function matches(e: KeyLike, combo: Combo, mac: boolean): boolean {
  if (combo.mac !== undefined && combo.mac !== mac) return false;
  const mod = mac ? e.metaKey : e.ctrlKey;
  const otherMod = mac ? e.ctrlKey : e.metaKey;
  if (!!combo.mod !== mod || otherMod) return false;
  if (!!combo.alt !== e.altKey) return false;
  // "+" e "=" richiedono Shift su molte tastiere: per loro conta il carattere, non Shift.
  const shiftFree = combo.key === "+" || combo.key === "=";
  if (!shiftFree && !!combo.shift !== e.shiftKey) return false;
  if (combo.code !== undefined) return e.code === combo.code;
  return e.key.toLowerCase() === combo.key;
}

/** L'azione corrispondente al tasto, o null. */
export function matchShortcut(e: KeyLike, mac = isMacPlatform()): ShortcutAction | null {
  // AltGr (Ctrl+Alt su Windows) scrive caratteri come @ [ ] # €: quelli non sono scorciatoie.
  // Se invece il tasto resta una lettera o una cifra (AltGr+T non scrive nulla) vale come Ctrl+Alt.
  if (e.getModifierState?.("AltGraph") && !/^[a-z0-9]$/i.test(e.key)) return null;
  for (const action of Object.keys(SHORTCUTS) as ShortcutAction[]) {
    if (SHORTCUTS[action].combos.some((c) => matches(e, c, mac))) return action;
  }
  return null;
}

const KEY_NAMES: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  PageUp: "PagSu",
  PageDown: "PagGiù",
  Enter: "Invio",
  NumpadEnter: "Invio",
  Escape: "Esc",
  Tab: "Tab",
  NumpadAdd: "+",
  NumpadSubtract: "−",
};

/** Tasti della scorciatoia, uno per elemento: ["Ctrl", "⇧", "Z"] (su macOS ["⌘", "⇧", "Z"]). */
export function shortcutKeys(action: ShortcutAction, mac = isMacPlatform()): string[] {
  const def = SHORTCUTS[action];
  if (def.display) return def.display.map((k) => (k === "Ctrl" && mac ? "⌘" : k));
  const combo = def.combos.find((c) => c.mac === undefined || c.mac === mac) ?? def.combos[0];
  const keys: string[] = [];
  if (combo.mod) keys.push(mac ? "⌘" : "Ctrl");
  if (combo.alt) keys.push(mac ? "⌥" : "Alt");
  if (combo.shift) keys.push("⇧");
  if (combo.code) keys.push(KEY_NAMES[combo.code] ?? combo.code.replace(/^(Digit|Numpad|Key)/, ""));
  else if (combo.key) keys.push(combo.key === "-" ? "−" : combo.key.toUpperCase());
  return keys;
}

/** "Ctrl Z": per tooltip e legende dei tasti. */
export function shortcutLabel(action: ShortcutAction, mac = isMacPlatform()): string {
  return shortcutKeys(action, mac).join(" ");
}

/** "Grassetto (Ctrl B)". */
export function shortcutTitle(action: ShortcutAction, mac = isMacPlatform()): string {
  return `${SHORTCUTS[action].label} (${shortcutLabel(action, mac)})`;
}

/** Il tasto viene da un campo di testo (input, select, textarea): lì le scorciatoie non scattano. */
export function fromFormField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA";
}
