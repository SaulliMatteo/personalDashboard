/*
 * Proposta automatica "mia materia → materia del gruppo". Pura: la provano gli script in scripts/gruppi
 * (subjects.test.mts). La proposta non conta finché l'utente non preme Conferma, quindi qui si preferisce unire:
 * l'utente o il proprietario del gruppo correggono a mano quando serve.
 */

/** Quanto due nomi devono somigliarsi per l'errore di battitura (1 = uguali). */
export const TYPO_THRESHOLD = 0.8;

/** Sotto questa lunghezza un errore di battitura non si distingue da un'altra parola: solo nomi uguali. */
const TYPO_MIN_LENGTH = 5;

const ROMAN = /^(x{0,2})(ix|iv|v?i{0,3})$/;

function isNumberWord(word: string): boolean {
  return /^\d+$/.test(word) || (word !== "" && ROMAN.test(word));
}

/** Parole del nome: minuscole, senza accenti, punteggiatura e spazi in più. "Àrte, Moderna!" → ["arte", "moderna"]. */
export function nameWords(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    // numero attaccato alla parola: "analisi1" → "analisi 1"
    .replace(/(\p{L})(\d+)(?=\s|$)/gu, "$1 $2")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w !== "");
}

/** Le parole senza i numeri finali (arabi o romani fino a XX), finché resta almeno una parola. */
export function baseWords(name: string): string[] {
  const words = nameWords(name);
  while (words.length > 1 && isNumberWord(words[words.length - 1])) words.pop();
  return words;
}

/** Nome normalizzato con i numeri: "Fisica  II." → "fisica ii". */
export function subjectKey(name: string): string {
  return nameWords(name).join(" ");
}

/** Distanza di Damerau–Levenshtein (versione "optimal string alignment": lo scambio di due lettere vale 1). */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** 1 − distanza / lunghezza maggiore. */
export function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  return longest === 0 ? 1 : 1 - editDistance(a, b) / longest;
}

function startsWith(words: string[], prefix: string[]): boolean {
  return prefix.length > 0 && prefix.length <= words.length && prefix.every((w, i) => words[i] === w);
}

export interface GroupSubjectName {
  id: string;
  name: string;
}

/** Perché è stata proposta: la UI non lo mostra, serve ai test e a capire le scelte. */
export type MatchRule = "same" | "same-base" | "extra-words" | "typo";

export interface SubjectProposal {
  id: string;
  rule: MatchRule;
}

interface Candidate {
  id: string;
  /** più alto = migliore */
  score: number;
}

/** Il migliore, o nessuno se i primi due sono pari (meglio nessuna proposta che una a caso). */
function best(candidates: Candidate[]): string | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  return sorted.length > 1 && sorted[0].score === sorted[1].score ? null : sorted[0].id;
}

/**
 * La materia del gruppo da proporre per una materia locale, con la prima regola che trova qualcosa:
 *  1. stesso nome (maiuscole, accenti e punteggiatura a parte): "fisica ii" → "Fisica II";
 *  2. stesso nome senza i numeri finali: "Analisi 2" → "Analisi", "analisi1" → "Analisi", "Fisica I" → "Fisica";
 *  3. parole in più: un nome è l'inizio dell'altro, a parole intere: "Fisica tecnica" → "Fisica";
 *  4. errore di battitura: somiglianza ≥ TYPO_THRESHOLD tra i nomi senza numeri: "Anlaisi" → "Analisi".
 * A parità vince chi ha meno parole di differenza; se resta una parità, nessuna proposta.
 */
export function proposeGroupSubject(localName: string, groupSubjects: GroupSubjectName[]): SubjectProposal | null {
  const key = subjectKey(localName);
  if (key === "") return null;
  const base = baseWords(localName);
  const subjects = groupSubjects.map((s) => ({ id: s.id, key: subjectKey(s.name), base: baseWords(s.name) }));
  const wordGap = (words: string[]) => -Math.abs(words.length - nameWords(localName).length);

  const same = subjects.filter((s) => s.key === key);
  if (same.length === 1) return { id: same[0].id, rule: "same" };

  const baseKey = base.join(" ");
  // stesso nome senza numeri: meglio la materia senza numero ("Fisica 1" → "Fisica") che una con un numero diverso
  // ("Fisica II"); fra due con numeri diversi ("Fisica III" con "Fisica I" e "Fisica II") nessuna proposta
  const sameBase = best(
    subjects
      .filter((s) => s.base.join(" ") === baseKey)
      .map((s) => ({ id: s.id, score: nameWords(s.key).length === s.base.length ? 1 : 0 }))
  );
  if (sameBase) return { id: sameBase, rule: "same-base" };

  const extra = best(
    subjects
      .filter((s) => startsWith(base, s.base) || startsWith(s.base, base))
      .map((s) => ({ id: s.id, score: Math.min(s.base.length, base.length) * 10 + wordGap(s.base) }))
  );
  if (extra) return { id: extra, rule: "extra-words" };

  if (baseKey.length < TYPO_MIN_LENGTH) return null;
  const typo = best(
    subjects
      .filter((s) => s.base.join(" ").length >= TYPO_MIN_LENGTH)
      .map((s) => ({ id: s.id, score: similarity(baseKey, s.base.join(" ")) }))
      .filter((c) => c.score >= TYPO_THRESHOLD)
  );
  return typo ? { id: typo, rule: "typo" } : null;
}

/**
 * Nome proposto per "Nuova materia del gruppo…": quello locale senza il numero finale (di base si unisce),
 * con le maiuscole dell'utente; si può sempre cambiare prima di crearla. "Analisi 2" → "Analisi".
 */
export function suggestedGroupSubjectName(localName: string, maxLength = 40): string {
  let name = localName.trim();
  for (;;) {
    const glued = name.match(/^(.*\p{L})[\s._-]*\d+$/u);
    if (glued) {
      name = glued[1].trim();
      continue;
    }
    const spaced = name.match(/^(.*\S)\s+(\S+?)\.?$/u);
    if (spaced && isNumberWord(spaced[2].toLowerCase())) {
      name = spaced[1].trim();
      continue;
    }
    break;
  }
  return name.slice(0, maxLength).trim();
}
