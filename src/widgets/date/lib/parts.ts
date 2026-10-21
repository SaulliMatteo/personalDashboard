/** Pezzi della data di oggi: "21", "ottobre", "martedì". */
export function dateParts(date: Date) {
  return {
    day: String(date.getDate()),
    month: date.toLocaleDateString("it-IT", { month: "long" }),
    weekday: date.toLocaleDateString("it-IT", { weekday: "long" }),
  };
}
