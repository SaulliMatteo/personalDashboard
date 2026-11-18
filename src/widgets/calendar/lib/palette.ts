/*
 * Colori che l'utente può scegliere per eventi e categorie (come la palette delle materie): sono colori scelti
 * dall'utente, quindi esadecimali ammessi (CLAUDE.md, Design). Stessa famiglia del mockup.
 */
export const EVENT_COLORS = ["#F08A8A", "#F0B47A", "#E8D27A", "#7DD3B0", "#7DC4E8", "#8EA6FF", "#C9A0F0", "#E89AC8"] as const;

export const COLOR_NAMES: Record<(typeof EVENT_COLORS)[number], string> = {
  "#F08A8A": "rosso",
  "#F0B47A": "arancione",
  "#E8D27A": "giallo",
  "#7DD3B0": "verde",
  "#7DC4E8": "azzurro",
  "#8EA6FF": "blu",
  "#C9A0F0": "viola",
  "#E89AC8": "rosa",
};

export function colorName(color: string | null): string {
  if (!color) return "come la categoria";
  return COLOR_NAMES[color.toUpperCase() as (typeof EVENT_COLORS)[number]] ?? color;
}
