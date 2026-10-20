import type { EmotionId } from "./face";

/**
 * Catalogo delle animazioni che l'utente può accendere o spegnere dalla
 * pagina del Companion. Gli id spenti sono salvati in un'unica impostazione
 * (`companionDisabledAnimations`, elenco separato da virgole).
 */
export type AnimationCategory = "life" | "emotes" | "study" | "video" | "system";

export interface AnimationDef {
  id: string;
  category: AnimationCategory;
  label: string;
  description: string;
  /** Per le emozioni casuali: quale emozione mostra. */
  emotion?: EmotionId;
}

export const ANIMATION_CATEGORIES: { id: AnimationCategory; label: string; description: string }[] = [
  { id: "life", label: "Vita di fondo", description: "Piccoli movimenti sempre attivi: sono loro a farlo sembrare vivo." },
  { id: "emotes", label: "Emozioni casuali", description: "Ogni tanto ne pesca una, con una frequenza che dipende dalla personalità." },
  { id: "study", label: "Studio", description: "Reazioni al timer del widget Studio." },
  { id: "video", label: "Video", description: "Mentre guardi un video nel widget YouTube (o, su Windows, nel browser e nei player)." },
  { id: "system", label: "Sistema (Windows)", description: "Usano segnali del PC, elaborati solo in locale e mai salvati." },
];

export const ANIMATIONS: AnimationDef[] = [
  { id: "blink", category: "life", label: "Battito di ciglia", description: "Chiude gli occhi ogni pochi secondi, a volte due volte." },
  { id: "wander", category: "life", label: "Sguardo che vaga", description: "Si guarda intorno con piccoli scatti." },
  { id: "breath", category: "life", label: "Respiro", description: "Una leggerissima pulsazione continua." },
  { id: "follow", category: "life", label: "Segue il mouse", description: "Guarda il puntatore quando lo muovi nella finestra." },

  { id: "emote_happy", category: "emotes", label: "Felice", description: "Occhi a mezzaluna e sorriso.", emotion: "happy" },
  { id: "emote_laugh", category: "emotes", label: "Risata", description: "Ride saltellando.", emotion: "laugh" },
  { id: "emote_love", category: "emotes", label: "Innamorato", description: "Occhi a cuore.", emotion: "love" },
  { id: "emote_surprised", category: "emotes", label: "Sorpreso", description: "Occhi spalancati e bocca a O.", emotion: "surprised" },
  { id: "emote_wink", category: "emotes", label: "Occhiolino", description: "Strizza un occhio.", emotion: "wink" },
  { id: "emote_curious", category: "emotes", label: "Curioso", description: "Sbircia di lato.", emotion: "curious" },
  { id: "emote_confused", category: "emotes", label: "Confuso", description: "Un occhio più grande dell'altro.", emotion: "confused" },
  { id: "emote_shy", category: "emotes", label: "Timido", description: "Arrossisce e guarda in basso.", emotion: "shy" },
  { id: "emote_bored", category: "emotes", label: "Annoiato", description: "Palpebre basse e puntini di sospensione.", emotion: "bored" },
  { id: "emote_sad", category: "emotes", label: "Triste", description: "Raro, e mai mentre studi.", emotion: "sad" },
  { id: "emote_angry", category: "emotes", label: "Arrabbiato", description: "Un broncio breve. Raro.", emotion: "angry" },
  { id: "emote_sleepy", category: "emotes", label: "Sbadiglio", description: "Si appisola un attimo.", emotion: "sleepy" },

  { id: "study_focus", category: "study", label: "Concentrato", description: "Mentre il timer corre, palpebre basse e sguardo sul libro." },
  { id: "study_read", category: "study", label: "Legge", description: "Lo sguardo scorre riga per riga come se leggesse." },
  { id: "study_cheer", category: "study", label: "Festeggia il pomodoro", description: "Quando finisce un pomodoro." },
  { id: "study_break", category: "study", label: "Pausa rilassata", description: "Durante la pausa si rilassa e dondola." },
  { id: "study_goal", category: "study", label: "Obiettivo raggiunto", description: "Quando superi l'obiettivo giornaliero." },

  { id: "video_watch", category: "video", label: "Guarda lo schermo", description: "Occhi spalancati fissi sul video." },
  { id: "video_glow", category: "video", label: "Riflesso dello schermo", description: "Una luce che scorre sugli occhi, come il bagliore del video." },
  { id: "video_react", category: "video", label: "Reazioni al video", description: "Ogni tanto ride o si sorprende." },

  { id: "sleep_idle", category: "system", label: "Dorme se sei via", description: "Dopo un po' che non tocchi mouse e tastiera si addormenta." },
  { id: "night", category: "system", label: "Assonnato di notte", description: "Dopo le 23 ha sonno anche lui." },
  { id: "app_react", category: "system", label: "Reagisce all'app aperta", description: "Musica, codice, chat, giochi… cambia espressione. Solo Windows." },
  { id: "welcome_back", category: "system", label: "Ti saluta quando torni", description: "Se sei stato via qualche minuto." },
];

export const ANIMATION_IDS = new Set(ANIMATIONS.map((a) => a.id));

/** Legge l'impostazione "id,id,id" ignorando id sconosciuti e spazi. */
export function parseDisabled(raw: string): Set<string> {
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => ANIMATION_IDS.has(s))
  );
}

export function serializeDisabled(disabled: Set<string>): string {
  return [...disabled].filter((id) => ANIMATION_IDS.has(id)).sort().join(",");
}
