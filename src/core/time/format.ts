/** "21:48". */
export function clockText(date: Date): string {
  return date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}
