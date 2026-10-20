import type { EmotionId } from "./face";

/**
 * Una personalità decide: umore di base, quali emozioni casuali pesca più
 * spesso, quanto parla, quanto spesso batte le ciglia e COSA dice.
 * Per aggiungerne una basta un elemento in PERSONALITIES.
 */
export type PhraseKey =
  | "greet_morning"
  | "greet_afternoon"
  | "greet_evening"
  | "greet_night"
  | "idle"
  | "study_start"
  | "pomodoro_done"
  | "break_over"
  | "study_stopped"
  | "goal_reached"
  | "video_start"
  | "video_end"
  | "file_received"
  | "welcome_back"
  | "sleep"
  | "night"
  | "coding"
  | "music"
  | "game"
  | "chat"
  | "poke";

export type PersonalityId = "cheerful" | "calm" | "sleepy" | "grumpy";

export interface Personality {
  id: PersonalityId;
  label: string;
  description: string;
  /** Espressione quando non succede nulla. */
  baseMood: EmotionId;
  /** Peso delle emozioni casuali (id animazione → peso). Mancante = 1. */
  emoteWeights: Partial<Record<string, number>>;
  /** Moltiplicatore della frequenza delle emozioni casuali. */
  emoteRate: number;
  /** Moltiplicatore della frequenza delle chiacchiere spontanee. */
  chattiness: number;
  /** Intervallo tra due battiti di ciglia, in ms. */
  blinkMs: [number, number];
  phrases: Record<PhraseKey, string[]>;
}

/*
 * Segnaposto nelle frasi:
 *   {,name}  →  ", Matteo" (o niente se il nome non è impostato)
 *   {app}    →  nome leggibile dell'app (es. "VS Code")
 *   {min}    →  minuti
 */
export const PERSONALITIES: Record<PersonalityId, Personality> = {
  cheerful: {
    id: "cheerful",
    label: "Allegro",
    description: "Sorride spesso, festeggia tutto e ti fa il tifo.",
    baseMood: "neutral",
    emoteWeights: { emote_happy: 3, emote_laugh: 2, emote_love: 1.5, emote_wink: 2, emote_curious: 1.5, emote_sad: 0.2, emote_angry: 0.1, emote_bored: 0.3 },
    emoteRate: 1.2,
    chattiness: 1.2,
    blinkMs: [2400, 5500],
    phrases: {
      greet_morning: ["Buongiorno{,name}! ☀", "Pronto per oggi{,name}?", "Che bella giornata per combinare qualcosa!"],
      greet_afternoon: ["Buon pomeriggio{,name}!", "Eccoti! Mi mancavi.", "Si riparte?"],
      greet_evening: ["Buonasera{,name}!", "Serata produttiva o rilassante?", "Ciao! Com'è andata oggi?"],
      greet_night: ["Ancora sveglio{,name}?", "Notte fonda, eh?"],
      idle: ["Che si fa?", "Io sono qui, eh!", "Hai bevuto un po' d'acqua?", "Mi piace stare qui con te.", "Tutto ok?", "Dritto con la schiena!"],
      study_start: ["Si studia! Ci sono anch'io.", "Forza, concentrazione!", "Andiamo, ce la fai!"],
      pomodoro_done: ["Pomodoro fatto! 🍅", "Grande! Ti meriti una pausa.", "Un altro in cassaforte!"],
      break_over: ["Pausa finita, si riparte!", "Ricaricato? Andiamo!"],
      study_stopped: ["Bel lavoro: {min} minuti!", "Fatto! {min} minuti di studio."],
      goal_reached: ["OBIETTIVO RAGGIUNTO! 🎉", "Ce l'hai fatta! Sono fiero di te!"],
      video_start: ["Cosa guardiamo?", "Popcorn pronti!"],
      video_end: ["Finito! Bello?", "E il prossimo?"],
      file_received: ["È arrivato un file!", "Posta in arrivo! 📦"],
      welcome_back: ["Bentornato! Com'è andata con {app}?", "Eccoti{,name}! Tutto bene con {app}?", "Bentornato{,name}!"],
      sleep: ["Zzz…", "Faccio un pisolino…"],
      night: ["Si sta facendo tardi…", "Dormire fa bene alla memoria, sai?"],
      coding: ["Codice! Che stai costruendo?", "Niente bug oggi, ok?"],
      music: ["Bella questa! ♪", "Si balla!"],
      game: ["Si gioca? Fai vedere!", "Vai, vinci!"],
      chat: ["Salutami tutti!", "Chiacchiere?"],
      poke: ["Ehi! 😄", "Hihi, solletico!", "Ciao ciao!"],
    },
  },
  calm: {
    id: "calm",
    label: "Calmo",
    description: "Pacato e discreto, parla poco e si muove piano.",
    baseMood: "relaxed",
    emoteWeights: { emote_happy: 2, emote_curious: 2, emote_shy: 1.5, emote_sleepy: 1, emote_laugh: 0.5, emote_surprised: 0.5, emote_angry: 0, emote_sad: 0.2 },
    emoteRate: 0.6,
    chattiness: 0.6,
    blinkMs: [3500, 7500],
    phrases: {
      greet_morning: ["Buongiorno.", "Una giornata nuova."],
      greet_afternoon: ["Buon pomeriggio.", "Ciao."],
      greet_evening: ["Buonasera.", "Con calma, stasera."],
      greet_night: ["È tardi. Va bene così?"],
      idle: ["Respira.", "Un passo alla volta.", "Va tutto bene.", "Ricordati di fare una pausa."],
      study_start: ["Concentrati, ci sono io.", "Con calma."],
      pomodoro_done: ["Bene. Ora riposa un po'.", "Un pomodoro in più."],
      break_over: ["Riprendiamo, piano piano."],
      study_stopped: ["{min} minuti. Ottimo lavoro."],
      goal_reached: ["Obiettivo raggiunto. Bravo.", "Ce l'hai fatta, con costanza."],
      video_start: ["Buona visione."],
      video_end: ["Finito."],
      file_received: ["È arrivato un file."],
      welcome_back: ["Bentornato.", "Ah, eccoti. Tutto bene con {app}?"],
      sleep: ["Zzz…"],
      night: ["Forse è ora di riposare."],
      coding: ["Codice. Bene."],
      music: ["Bella musica."],
      game: ["Divertiti."],
      chat: ["Buona chiacchierata."],
      poke: ["Oh. Ciao.", "Sono qui."],
    },
  },
  sleepy: {
    id: "sleepy",
    label: "Dormiglione",
    description: "Sempre un po' assonnato, sbadiglia e si addormenta presto.",
    baseMood: "neutral",
    emoteWeights: { emote_sleepy: 4, emote_bored: 2, emote_happy: 1, emote_curious: 0.8, emote_surprised: 0.6, emote_angry: 0.1 },
    emoteRate: 0.9,
    chattiness: 0.8,
    blinkMs: [1800, 4200],
    phrases: {
      greet_morning: ["Mmh… già mattina?", "Buon… *sbadiglio* …giorno."],
      greet_afternoon: ["Ciao… stavo quasi dormendo.", "Pomeriggio, ora della pennichella."],
      greet_evening: ["Sera… quasi ora di nanna."],
      greet_night: ["Zzz… ah, sei tu.", "È notte, dormiamo?"],
      idle: ["*sbadiglio*", "Cinque minuti e mi riprendo…", "Che sonno…", "Un caffè?"],
      study_start: ["Ok… sto sveglio per te.", "Studiamo. Io tengo gli occhi aperti. Forse."],
      pomodoro_done: ["Pausa! Finalmente…", "Fatto. Posso dormire 5 minuti?"],
      break_over: ["Di già? …va bene."],
      study_stopped: ["{min} minuti… impressionante, io sarei crollato."],
      goal_reached: ["Obiettivo! Mi sono pure svegliato per festeggiare!"],
      video_start: ["Se mi addormento svegliami a metà."],
      video_end: ["Ah, è già finito? Dormivo."],
      file_received: ["Mh? Un file."],
      welcome_back: ["Oh, sei tornato. Dormivo un po'.", "Tu con {app}, io con un pisolino."],
      sleep: ["Zzz…", "Zzz… zzz…"],
      night: ["Nanna. Subito.", "Io dormo, tu fai come vuoi."],
      coding: ["Codice… che sonno…"],
      music: ["Mettine una più lenta, ninna nanna?"],
      game: ["Sveglia! Si gioca!"],
      chat: ["Chiacchiere… zzz."],
      poke: ["Eh? Sono sveglio!", "Mh… cinque minuti…"],
    },
  },
  grumpy: {
    id: "grumpy",
    label: "Brontolone",
    description: "Burbero e sarcastico, ma in fondo ti vuole bene.",
    baseMood: "neutral",
    emoteWeights: { emote_bored: 3, emote_angry: 1.2, emote_confused: 2, emote_curious: 1.5, emote_happy: 0.6, emote_love: 0.15, emote_laugh: 0.5, emote_wink: 0.8 },
    emoteRate: 0.9,
    chattiness: 1,
    blinkMs: [2600, 6000],
    phrases: {
      greet_morning: ["Ah, sei tu. Buongiorno, immagino.", "Mattina. Che entusiasmo."],
      greet_afternoon: ["Finalmente. Ti aspettavo.", "Pomeriggio. Combiniamo qualcosa?"],
      greet_evening: ["Sera. Oggi hai fatto qualcosa?"],
      greet_night: ["Ma a quest'ora?!", "Tu non dormi mai?"],
      idle: ["Allora? Si lavora o no?", "Mi annoio.", "Fai qualcosa di utile.", "Sto guardando, eh."],
      study_start: ["Era ora.", "Vediamo quanto resisti."],
      pomodoro_done: ["Non male. Non male davvero.", "Ok, te lo concedo: pausa."],
      break_over: ["Basta pausa. Al lavoro."],
      study_stopped: ["Solo {min} minuti? …va beh, meglio di niente."],
      goal_reached: ["Obiettivo raggiunto. Ok, sono colpito.", "Non lo dirò due volte: bravo."],
      video_start: ["Studio o svago? Non dirmelo."],
      video_end: ["E adesso torniamo a cose serie?"],
      file_received: ["Un file. Che emozione."],
      welcome_back: ["Ah, ti sei ricordato di me. Divertente {app}, eh?", "Bentornato. Ci hai messo."],
      sleep: ["Zzz… (non svegliarmi)"],
      night: ["Vai a dormire. Sul serio."],
      coding: ["Speriamo compili.", "Hai scritto i test? No, eh."],
      music: ["Gusti discutibili. ♪"],
      game: ["Ah, giochiamo invece di lavorare."],
      chat: ["Meno chat, più lavoro."],
      poke: ["Non toccare.", "Che vuoi?", "…ok, ciao."],
    },
  },
};

export const PERSONALITY_IDS = Object.keys(PERSONALITIES) as PersonalityId[];

export function fillPhrase(template: string, vars: { name?: string; app?: string; min?: number }): string {
  return template
    .replace("{,name}", vars.name ? `, ${vars.name}` : "")
    .replace("{app}", vars.app ?? "un'altra app")
    .replace("{min}", String(vars.min ?? 0));
}
