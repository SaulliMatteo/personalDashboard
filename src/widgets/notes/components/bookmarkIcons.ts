import { createElement } from "react";
import type { IconType } from "react-icons";
import { MdBookmarkBorder, MdHelpOutline, MdOutlinePictureAsPdf, MdPriorityHigh, MdStarBorder, MdTaskAlt, MdUpdate } from "react-icons/md";
import type { MarkKind } from "../lib/bookmarks";

/** Icona di ogni tipo di segno: la stessa in tutti i temi (cambia il marcatore nel testo, nel CSS). */
const ICONS: Record<MarkKind, IconType> = {
  bookmark: MdBookmarkBorder,
  star: MdStarBorder,
  important: MdPriorityHigh,
  question: MdHelpOutline,
  review: MdUpdate,
  todo: MdTaskAlt,
  pdf: MdOutlinePictureAsPdf,
};

/** L'icona del tipo come elemento (createElement: niente componenti scelti durante il render). */
export function bookmarkIcon(kind: MarkKind, className?: string) {
  return createElement(ICONS[kind] ?? MdBookmarkBorder, { className, "aria-hidden": true });
}

/** Il colore del segno come variabile CSS: chiave della palette → token del tema, libero → così com'è. */
export function bookmarkColorVar(color: string | null): string | undefined {
  if (!color) return undefined;
  return color.startsWith("#") ? color : `var(--nq-ink-${color})`;
}
