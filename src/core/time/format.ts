/** "Martedì 20 ottobre". */
export function dateText(date: Date): string {
  const text = date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "21:48". */
export function clockText(date: Date): string {
  return date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}
