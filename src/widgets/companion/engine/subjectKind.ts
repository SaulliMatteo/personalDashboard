/**
 * Dal nome di una materia di Studio (scelto dall'utente) al tipo di simbolo
 * che il Companion mostra sopra il libro. Parole chiave in italiano e
 * inglese; se nulla corrisponde resta solo il libro.
 */
export type SubjectKind = "math" | "science" | "lang" | "history" | "art" | "code" | "other";

const KINDS: { kind: SubjectKind; test: RegExp }[] = [
  // L'ordine conta: vince la prima che corrisponde (le parole più specifiche stanno prima).
  { kind: "code", test: /informatic|programmazion|coding|computer|software|reti\b|database|basi di dati|algoritm|sistemi operativi|web|python|java|sql/i },
  { kind: "math", test: /matemat|analisi|algebra|geometri|calcolo|statistic|probabilit|aritmet|trigonometr|\bmath|calculus|logica/i },
  { kind: "science", test: /fisic|chimic|biolog|scienz|anatomi|fisiolog|genetic|astronom|geolog|physics|chemistry|biology|science|medicin|farmac/i },
  { kind: "lang", test: /italian|ingles|frances|spagnol|tedesc|latin|grec|letteratur|grammatic|lingu|english|french|spanish|german|giappones|cines/i },
  { kind: "history", test: /stori|filosof|diritto|economi|geografi|educazione civica|sociolog|psicolog|history|philosophy|law|religion|pedagog/i },
  { kind: "art", test: /\barte\b|disegn|music|storia dell'arte|design|art\b|fotograf|teatro|cinema/i },
];

export function subjectKind(name: string | null): SubjectKind {
  if (!name) return "other";
  // "Storia dell'arte" è arte, non storia: le eccezioni più lunghe prima.
  if (/storia dell'arte|art history/i.test(name)) return "art";
  return KINDS.find((k) => k.test.test(name))?.kind ?? "other";
}
