import type { EmotionId, FaceMotion, GlyphId } from "./face";
import type { PersonalityId, PhraseKey } from "./personalities";

/**
 * Le POSE del Companion: cosa mostra in ogni situazione (espressione,
 * sguardo, movimento, simbolo e "costume"). Il cervello sceglie la posa,
 * qui sta com'è fatta; i costumi si disegnano in render/costumes.ts.
 * Fonte grafica: il mockup approvato "Pixy, nuove pose".
 *
 * Ogni personalità può cambiare una posa con una variante (POSE_VARIANTS):
 * il resto lo fanno i ritocchi automatici della personalità (animator.ts).
 */

/** Disegni che si aggiungono alla faccia (o la sostituiscono, come la fiamma). */
export type CostumeId =
  | "flame"
  | "snow"
  | "nightcap"
  | "blanket"
  | "book"
  | "book_math"
  | "book_science"
  | "book_lang"
  | "book_history"
  | "book_art"
  | "book_code"
  | "headphones"
  | "headset"
  | "chat"
  | "glasses"
  | "beret"
  | "gamepad"
  | "sword"
  | "scroll"
  | "opera"
  | "pickaxe"
  | "crosshair"
  | "popcorn"
  | "play"
  | "live"
  | "webcam"
  | "plane"
  | "sheet"
  | "slides"
  | "cube"
  | "equalizer"
  | "ai"
  | "folder"
  | "scared"
  | "tears"
  | "glasses3d"
  | "progress"
  | "pause"
  | "confetti";

/**
 * Dove guarda: "face" = lo sguardo dell'espressione; "upRight" = verso un
 * oggetto in alto a destra; "kernel", "aim", "plane" seguono il costume.
 */
export type GazeMode = "wander" | "read" | "screen" | "down" | "sleep" | "fixed" | "face" | "upRight" | "scan" | "kernel" | "aim" | "plane" | "away";

export interface PoseSpec {
  /** Stato mostrato sotto il nome (card, mini, pagina). */
  label: string;
  mood: EmotionId;
  gaze: GazeMode;
  /** Sostituisce il movimento dell'espressione. */
  motion?: FaceMotion;
  /** Sostituisce il simbolo dell'espressione (null = nessuno). */
  glyph?: GlyphId | null;
  costume?: CostumeId | null;
  /** Si appisola piano e si risveglia di scatto. */
  doze?: boolean;
  /** Bagliore dello schermo sugli occhi. */
  glow?: boolean;
  /** Moltiplica il tempo delle animazioni (oltre a quello della personalità). */
  speed?: number;
  /** Frase detta entrando nella posa (le frasi stanno in personalities.ts). */
  phrase?: PhraseKey;
}

const BASE = {
  // --- Di fondo
  idle: { label: "Ti tiene compagnia", mood: "neutral", gaze: "wander" },
  sleep: { label: "Dorme", mood: "sleep", gaze: "sleep", motion: "sway", glyph: "z", phrase: "sleep" },
  bedtime: { label: "In pigiama", mood: "sleepy", gaze: "down", motion: "nod", costume: "nightcap", phrase: "night" },
  bed: { label: "Dorme sotto le coperte", mood: "sleep", gaze: "sleep", glyph: "z", costume: "blanket", motion: "none" },

  // --- Studio
  study: { label: "Studia con te", mood: "focused", gaze: "read", costume: "book" },
  study_math: { label: "Studia matematica", mood: "focused", gaze: "read", costume: "book_math", phrase: "study_math" },
  study_science: { label: "Studia scienze", mood: "focused", gaze: "read", costume: "book_science", phrase: "study_science" },
  study_lang: { label: "Studia le lingue", mood: "focused", gaze: "read", costume: "book_lang", phrase: "study_lang" },
  study_history: { label: "Studia storia", mood: "focused", gaze: "read", costume: "book_history", phrase: "study_history" },
  study_art: { label: "Studia arte", mood: "focused", gaze: "read", costume: "book_art", phrase: "study_art" },
  study_code: { label: "Studia informatica", mood: "focused", gaze: "read", costume: "book_code", phrase: "study_code" },
  study_break: { label: "In pausa", mood: "relaxed", gaze: "wander", motion: "sway" },
  study_wait: { label: "Aspetta che riprendi", mood: "neutral", gaze: "wander", glyph: "dots" },

  // --- Video
  video_watch: { label: "Guarda il video", mood: "watching", gaze: "screen", glow: true, phrase: "video_start" },
  video_popcorn: { label: "Guarda col popcorn", mood: "watching", gaze: "kernel", glow: true, costume: "popcorn", phrase: "video_popcorn" },
  video_cinema: { label: "Al cinema", mood: "watching", gaze: "screen", glow: true, costume: "glasses3d", phrase: "video_cinema" },
  video_progress: { label: "Guarda il video", mood: "watching", gaze: "screen", glow: true, costume: "progress", phrase: "video_start" },
  video_paused: { label: "Aspetta che riparta", mood: "neutral", gaze: "wander", costume: "pause", phrase: "video_paused" },
  video_bored: { label: "Si annoia", mood: "bored", gaze: "face", glyph: "dots", phrase: "video_bored" },
  video_late: { label: "Video a tarda notte", mood: "watching", gaze: "screen", glow: true, doze: true, costume: "nightcap", phrase: "video_late" },

  // --- App per tipo
  app_coding: { label: "Serio, ti guarda lavorare", mood: "serious", gaze: "fixed", phrase: "coding" },
  app_office: { label: "Legge con te", mood: "focused", gaze: "screen", costume: "glasses", phrase: "office" },
  app_design: { label: "Fa l'artista", mood: "happy", gaze: "wander", costume: "beret", phrase: "design" },
  app_game: { label: "Fa il tifo", mood: "watching", gaze: "screen", costume: "gamepad", phrase: "game" },
  app_chat: { label: "Curiosa in chat", mood: "curious", gaze: "face", costume: "chat", phrase: "chat" },
  app_music: { label: "Ascolta la musica", mood: "relaxed", gaze: "wander", motion: "beat", glyph: "note", costume: "headphones", phrase: "music" },
  app_browser: { label: "Naviga con te", mood: "watching", gaze: "scan", costume: "scroll", phrase: "browser" },

  // --- App specifiche
  app_discord: { label: "In chiamata su Discord", mood: "talking", gaze: "wander", costume: "headset", phrase: "discord" },
  app_lol: { label: "In partita", mood: "determined", gaze: "screen", costume: "sword", phrase: "lol" },
  app_opera: { label: "Naviga con te", mood: "watching", gaze: "scan", costume: "opera", phrase: "browser" },
  app_spotify: { label: "Ascolta Spotify", mood: "relaxed", gaze: "wander", motion: "beat", costume: "equalizer", phrase: "music" },
  app_youtube: { label: "Guarda YouTube", mood: "watching", gaze: "screen", glow: true, costume: "play", phrase: "youtube" },
  app_streaming: { label: "Guarda un film", mood: "watching", gaze: "kernel", glow: true, costume: "popcorn", phrase: "video_popcorn" },
  app_live: { label: "In diretta", mood: "excited", gaze: "wander", glyph: null, motion: "none", costume: "live", phrase: "live" },
  app_call: { label: "In videochiamata", mood: "happy", gaze: "fixed", costume: "webcam", phrase: "call" },
  app_messages: { label: "Legge i messaggi", mood: "curious", gaze: "plane", costume: "plane", phrase: "chat" },
  app_minecraft: { label: "Scava in Minecraft", mood: "happy", gaze: "wander", costume: "pickaxe", phrase: "minecraft" },
  app_shooter: { label: "Prende la mira", mood: "aim", gaze: "aim", costume: "crosshair", phrase: "shooter" },
  app_excel: { label: "Fa i conti", mood: "focused", gaze: "down", costume: "sheet", phrase: "excel" },
  app_slides: { label: "Prepara le slide", mood: "happy", gaze: "upRight", costume: "slides", phrase: "slides" },
  app_blender: { label: "Modella in 3D", mood: "curious", gaze: "upRight", costume: "cube", phrase: "blender" },
  app_ai: { label: "Curioso dell'IA", mood: "curious", gaze: "upRight", costume: "ai", phrase: "ai" },
  app_explorer: { label: "Cerca un file", mood: "watching", gaze: "scan", costume: "folder", phrase: "explorer" },

  // --- Reazioni (durano qualche secondo, sopra la posa di fondo)
  react_greet: { label: "Saluta", mood: "happy", gaze: "wander", motion: "bounce" },
  react_poke: { label: "Ride", mood: "laugh", gaze: "wander", motion: "bounce" },
  react_welcome: { label: "Ti saluta", mood: "happy", gaze: "wander" },
  react_pomodoro: { label: "Festeggia", mood: "excited", gaze: "wander", motion: "bounce", glyph: "star" },
  react_goal: { label: "Festeggia", mood: "excited", gaze: "wander", motion: "bounce", costume: "confetti", glyph: "spark" },
  react_video_end: { label: "Applaude", mood: "excited", gaze: "wander", motion: "bounce", costume: "confetti", glyph: null },
  react_scared: { label: "Si spaventa", mood: "surprised", gaze: "screen", motion: "tremble", costume: "scared", glyph: null },
  react_moved: { label: "Si commuove", mood: "sad", gaze: "screen", costume: "tears", glyph: null },
  react_hot: { label: "Ha caldo", mood: "hot", gaze: "screen", motion: "flicker", costume: "flame" },
  react_cold: { label: "Ha freddo", mood: "cold", gaze: "wander", motion: "tremble", costume: "snow" },
} satisfies Record<string, PoseSpec>;

export type PoseId = keyof typeof BASE;
export const POSES: Record<PoseId, PoseSpec> = BASE;

type Variants = Partial<Record<PersonalityId, Partial<PoseSpec>>>;

const STUDY: Variants = {
  calm: { speed: 0.7 },
  sleepy: { doze: true },
  grumpy: { mood: "serious" },
};

/** Varianti per personalità, dove i soli ritocchi automatici non bastano (vedi mockup). */
export const POSE_VARIANTS: Partial<Record<PoseId, Variants>> = {
  sleep: {
    calm: { speed: 0.6 },
    sleepy: { costume: "blanket", motion: "none" },
  },
  bedtime: {
    cheerful: { mood: "relaxed" },
    calm: { mood: "relaxed", speed: 0.6 },
    sleepy: { doze: true },
    grumpy: { mood: "bored" },
  },

  study: STUDY,
  study_math: STUDY,
  study_science: STUDY,
  study_lang: STUDY,
  study_history: STUDY,
  study_art: STUDY,
  study_code: STUDY,
  study_break: {
    cheerful: { motion: "bounce" },
    sleepy: { mood: "sleepy", doze: true },
    grumpy: { mood: "bored", motion: "none", glyph: "dots" },
  },
  study_wait: {
    cheerful: { mood: "curious" },
    calm: { mood: "relaxed", glyph: null },
    sleepy: { doze: true },
    grumpy: { mood: "determined" },
  },

  video_watch: {
    calm: { mood: "relaxed" },
    sleepy: { doze: true },
    grumpy: { mood: "serious" },
  },
  video_popcorn: { calm: { speed: 0.6 }, sleepy: { doze: true }, grumpy: { mood: "serious" } },
  video_cinema: { cheerful: { mood: "excited", glyph: null }, sleepy: { doze: true }, grumpy: { mood: "serious" } },
  video_progress: { sleepy: { doze: true }, grumpy: { mood: "serious" } },
  video_paused: { cheerful: { mood: "curious" }, sleepy: { doze: true, glyph: "z" }, grumpy: { mood: "determined" } },
  video_bored: {
    cheerful: { mood: "curious" },
    calm: { mood: "relaxed", glyph: null },
    sleepy: { mood: "sleep", gaze: "sleep", glyph: "z" },
    grumpy: { mood: "angry", glyph: "anger" },
  },
  video_late: { cheerful: { doze: false }, grumpy: { mood: "serious" } },

  app_office: { sleepy: { doze: true }, grumpy: { mood: "serious" } },
  app_design: { calm: { mood: "relaxed" }, sleepy: { mood: "sleepy" }, grumpy: { mood: "serious" } },
  app_game: {
    cheerful: { mood: "excited", motion: "bounce", glyph: null },
    sleepy: { doze: true },
    grumpy: { mood: "determined", glyph: "anger" },
  },
  app_chat: { sleepy: { mood: "sleepy" }, grumpy: { mood: "bored", glyph: null } },
  app_music: {
    cheerful: { mood: "happy" },
    calm: { motion: "sway", speed: 0.6 },
    sleepy: { mood: "sleep", gaze: "sleep", glyph: "z", motion: "sway" },
    grumpy: { mood: "bored", motion: "nod", glyph: null },
  },
  app_browser: { sleepy: { doze: true }, grumpy: { mood: "bored", glyph: null } },
  app_discord: {
    calm: { speed: 0.6 },
    sleepy: { mood: "sleepy", doze: true },
    grumpy: { mood: "angry", glyph: "anger", motion: "talk" },
  },
  app_lol: {
    cheerful: { mood: "excited", glyph: "star", motion: "none" },
    calm: { speed: 0.6 },
    sleepy: { mood: "sleepy", doze: true },
    grumpy: { mood: "angry", glyph: "anger", motion: "none" },
  },
  app_opera: { sleepy: { doze: true }, grumpy: { mood: "bored", glyph: null } },
  app_spotify: {
    calm: { motion: "sway", speed: 0.6 },
    sleepy: { mood: "sleep", gaze: "sleep", motion: "sway", glyph: "z", speed: 0.5 },
    grumpy: { mood: "bored", motion: "nod", glyph: null },
  },
  app_youtube: { sleepy: { doze: true }, grumpy: { mood: "serious" } },
  app_streaming: { sleepy: { doze: true }, grumpy: { mood: "serious" } },
  app_live: { calm: { mood: "relaxed", speed: 0.6 }, sleepy: { mood: "sleepy" }, grumpy: { mood: "serious", glyph: null } },
  app_call: { calm: { mood: "relaxed" }, sleepy: { mood: "sleepy", doze: true }, grumpy: { mood: "serious" } },
  app_messages: { sleepy: { mood: "sleepy" }, grumpy: { mood: "bored", glyph: null } },
  app_minecraft: { cheerful: { mood: "excited", glyph: null, motion: "none" }, sleepy: { mood: "sleepy" }, grumpy: { mood: "determined" } },
  app_shooter: { cheerful: { mood: "excited", glyph: null, motion: "none" }, sleepy: { doze: true }, grumpy: { mood: "angry", glyph: "anger", motion: "none" } },
  app_excel: { sleepy: { doze: true }, grumpy: { mood: "serious" } },
  app_slides: { sleepy: { doze: true }, grumpy: { mood: "serious" } },
  app_blender: { sleepy: { mood: "sleepy", speed: 0.5 }, grumpy: { mood: "serious" } },
  app_ai: { calm: { mood: "relaxed" }, sleepy: { mood: "sleepy" }, grumpy: { mood: "bored", glyph: null } },
  app_explorer: { sleepy: { doze: true }, grumpy: { mood: "bored", glyph: null } },

  react_greet: {
    calm: { mood: "relaxed", motion: "nod" },
    sleepy: { mood: "sleepy", motion: "nod", doze: true },
    grumpy: { mood: "bored", motion: "none", glyph: "dots" },
  },
  react_poke: {
    calm: { mood: "shy", motion: "sway" },
    sleepy: { mood: "surprised", motion: "none", doze: true, glyph: null },
    grumpy: { mood: "angry", motion: "shake", glyph: "anger" },
  },
  react_welcome: {
    cheerful: { motion: "bounce" },
    calm: { mood: "relaxed" },
    sleepy: { mood: "sleepy", doze: true },
    grumpy: { mood: "bored", glyph: "dots" },
  },
  react_pomodoro: {
    calm: { mood: "proud", motion: "nod", glyph: "spark" },
    sleepy: { mood: "relaxed", motion: "sway", glyph: "z" },
    grumpy: { mood: "proud", motion: "none", glyph: null },
  },
  react_goal: {
    calm: { mood: "proud", motion: "nod", speed: 0.6 },
    sleepy: { mood: "happy", speed: 0.55 },
    grumpy: { mood: "proud", motion: "none" },
  },
  react_video_end: {
    calm: { mood: "proud", motion: "nod", speed: 0.5 },
    sleepy: { mood: "sleepy", speed: 0.5, doze: true },
    grumpy: { mood: "bored", motion: "none", speed: 0.4 },
  },
  react_scared: {
    calm: { motion: "none", speed: 0.5 },
    sleepy: { mood: "sleepy", motion: "none" },
    grumpy: { mood: "angry", costume: null, motion: "shake", glyph: "anger" },
  },
  react_moved: {
    calm: { speed: 0.5 },
    sleepy: { mood: "sleepy" },
    grumpy: { gaze: "away" },
  },
  react_hot: {
    calm: { mood: "relaxed", speed: 0.45 },
    sleepy: { mood: "sleepy", speed: 0.6 },
    grumpy: { mood: "angry", speed: 1.7, glyph: "anger" },
  },
  react_cold: {
    cheerful: { mood: "happy" },
    calm: { mood: "relaxed", motion: "none", speed: 0.5 },
    sleepy: { mood: "sleep", gaze: "sleep", motion: "none", glyph: "z", speed: 0.5 },
    grumpy: { mood: "angry", glyph: "anger" },
  },
};

/** La posa com'è per una personalità. */
export function resolvePose(id: PoseId, personality: PersonalityId): PoseSpec {
  const variant = POSE_VARIANTS[id]?.[personality];
  return variant ? { ...POSES[id], ...variant } : POSES[id];
}

// ----------------------------------------------------------------- oggetti che si muovono

/*
 * Posizioni (in punti faccia) di oggetti che lo sguardo segue: usate sia
 * dall'animatore (dove guardare) sia dal disegno dei costumi. `t` è il
 * tempo del costume in secondi.
 */

/** Il chicco di popcorn che salta. */
export function kernelPos(t: number): [number, number] {
  const p = (t * 0.9) % 1;
  return [13 + p * 3, 12 - Math.sin(p * Math.PI) * 6];
}

/** Il mirino dello sparatutto. */
export function aimPos(t: number): [number, number] {
  return [15 + Math.sin(t * 1.3) * 8, 8.5 + Math.sin(t * 1.9) * 4];
}

/** L'aeroplanino di carta dei messaggi. */
export function planePos(t: number): [number, number] {
  return [-6 + ((t * 7) % 46), -5 + Math.sin(t * 2) * 1.2];
}
