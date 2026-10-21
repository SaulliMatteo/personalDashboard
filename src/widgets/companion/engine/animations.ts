import type { EmotionId } from "./face";
import type { PoseId } from "./poses";

/**
 * Catalogo delle animazioni che l'utente può accendere o spegnere dalla
 * pagina del Companion. Gli id spenti sono salvati in un'unica impostazione
 * (`companionDisabledAnimations`, elenco separato da virgole).
 */
export type AnimationCategory = "life" | "emotes" | "study" | "video" | "weather" | "night" | "apps" | "system";

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
  { id: "video", label: "Video", description: "Mentre guardi un video nel widget YouTube (o nei player del PC; su Windows anche nel browser)." },
  { id: "weather", label: "Meteo", description: "Con il widget Meteo attivo: ogni tanto si trasforma, per qualche secondo." },
  { id: "night", label: "Notte", description: "Pigiama prima di mezzanotte, coperte dopo." },
  { id: "apps", label: "App (Windows e macOS)", description: "Cambia posa in base all'app che stai usando. Le categorie si correggono nella scheda \"App viste\"." },
  { id: "system", label: "Sistema", description: "Usano segnali del PC, elaborati solo in locale e mai salvati." },
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
  { id: "study_book", category: "study", label: "Libro", description: "Legge un libro aperto; ogni tanto gira una pagina." },
  { id: "study_subject", category: "study", label: "Simbolo della materia", description: "Sopra la testa: «1+1=2», provetta, «Aa», clessidra, pennello o «</>», dal nome della materia." },
  { id: "study_read", category: "study", label: "Legge", description: "Lo sguardo scorre riga per riga come se leggesse." },
  { id: "study_cheer", category: "study", label: "Festeggia il pomodoro", description: "Quando finisce un pomodoro." },
  { id: "study_break", category: "study", label: "Pausa rilassata", description: "Durante la pausa si rilassa e dondola." },
  { id: "study_goal", category: "study", label: "Obiettivo raggiunto", description: "Quando superi l'obiettivo giornaliero." },

  { id: "video_watch", category: "video", label: "Guarda lo schermo", description: "Occhi spalancati fissi sul video." },
  { id: "video_glow", category: "video", label: "Riflesso dello schermo", description: "Una luce che scorre sugli occhi, come il bagliore del video." },
  { id: "video_react", category: "video", label: "Reazioni al video", description: "Ogni tanto ride, si sorprende, si spaventa (coperta fino agli occhi) o si commuove." },
  { id: "video_popcorn", category: "video", label: "Popcorn", description: "A volte guarda con una ciotola di popcorn e segue con gli occhi i chicchi che saltano." },
  { id: "video_cinema", category: "video", label: "Occhiali 3D", description: "Per i video lunghi e i player (VLC, film e serie)." },
  { id: "video_bored", category: "video", label: "Si annoia", description: "Se il video va avanti più di 20 minuti senza che tocchi niente." },
  { id: "video_progress", category: "video", label: "Barra di avanzamento", description: "Solo widget YouTube: una linea sotto la faccia si riempie piano." },
  { id: "video_pause", category: "video", label: "In pausa", description: "Solo widget YouTube: simbolo ⏸ e si guarda intorno aspettando." },
  { id: "video_end", category: "video", label: "Fine del video", description: "Applaude tra i coriandoli." },
  { id: "video_late", category: "video", label: "Video a tarda notte", description: "Dopo le 23 guarda in pigiama e ogni tanto si appisola." },

  { id: "weather_hot", category: "weather", label: "Fiamma", description: "Quando fa caldo diventa una fiamma (soglia nelle impostazioni)." },
  { id: "weather_cold", category: "weather", label: "Fiocco di neve", description: "Quando fa freddo diventa un fiocco di neve." },

  { id: "sleep_idle", category: "system", label: "Dorme se sei via", description: "Dopo un po' che non tocchi mouse e tastiera si addormenta." },
  { id: "night", category: "night", label: "Pigiama", description: "Dalle 23 a mezzanotte: cuffia da notte, colletto del pigiama, sbadigli." },
  { id: "bed_blanket", category: "night", label: "Sotto le coperte", description: "Da mezzanotte alle 5 dorme sul cuscino, se non stai facendo altro." },

  { id: "app_react", category: "apps", label: "Pose per tipo di app", description: "Codice (serio), documenti, grafica, giochi, chat, musica, browser." },
  { id: "app_specific", category: "apps", label: "Pose per app specifiche", description: "Discord, League of Legends, Opera, Spotify, YouTube, Netflix, Twitch, Teams, Minecraft e altre." },
  { id: "welcome_back", category: "system", label: "Ti saluta quando torni", description: "Se sei stato via qualche minuto." },
];

export const ANIMATION_IDS = new Set(ANIMATIONS.map((a) => a.id));

/** Una voce della galleria: una posa da provare, oppure un'animazione del catalogo (le emozioni). */
export interface GalleryItem {
  label: string;
  pose?: PoseId;
  animation?: string;
}

const pose = (p: PoseId, label: string): GalleryItem => ({ pose: p, label });

/**
 * Galleria della pagina di dettaglio: per ogni gruppo, tutte le pose che
 * Pixy può fare, da provare una per una o in sequenza.
 */
export const ANIMATION_GALLERY: Partial<Record<AnimationCategory, { label?: string; items: GalleryItem[] }[]>> = {
  emotes: [{ items: ANIMATIONS.filter((a) => a.emotion).map((a) => ({ animation: a.id, label: a.label })) }],
  study: [
    {
      items: [
        pose("study", "Libro"),
        pose("study_math", "Matematica"),
        pose("study_science", "Scienze"),
        pose("study_lang", "Lingue"),
        pose("study_history", "Storia"),
        pose("study_art", "Arte"),
        pose("study_code", "Informatica"),
        pose("study_break", "Pausa"),
        pose("study_wait", "Timer fermo"),
        pose("react_pomodoro", "Pomodoro finito"),
        pose("react_goal", "Obiettivo"),
      ],
    },
  ],
  video: [
    {
      items: [
        pose("video_watch", "Guarda"),
        pose("video_popcorn", "Popcorn"),
        pose("video_cinema", "Occhiali 3D"),
        pose("video_progress", "Barra"),
        pose("video_paused", "Pausa"),
        pose("video_bored", "Si annoia"),
        pose("video_late", "Tarda notte"),
        pose("react_scared", "Spavento"),
        pose("react_moved", "Commosso"),
        pose("react_video_end", "Fine del video"),
      ],
    },
  ],
  weather: [{ items: [pose("react_hot", "Fiamma"), pose("react_cold", "Fiocco di neve")] }],
  night: [{ items: [pose("bedtime", "Pigiama"), pose("bed", "Sotto le coperte"), pose("sleep", "Dorme")] }],
  apps: [
    {
      label: "Per tipo",
      items: [
        pose("app_coding", "Codice"),
        pose("app_office", "Documenti"),
        pose("app_design", "Grafica"),
        pose("app_game", "Giochi"),
        pose("app_chat", "Chat"),
        pose("app_music", "Musica"),
        pose("app_browser", "Browser"),
      ],
    },
    {
      label: "App specifiche",
      items: [
        pose("app_discord", "Discord"),
        pose("app_lol", "League of Legends"),
        pose("app_opera", "Opera"),
        pose("app_spotify", "Spotify"),
        pose("app_youtube", "YouTube"),
        pose("app_streaming", "Netflix e film"),
        pose("app_live", "Twitch e OBS"),
        pose("app_call", "Teams e Zoom"),
        pose("app_messages", "Telegram e WhatsApp"),
        pose("app_minecraft", "Minecraft"),
        pose("app_shooter", "Sparatutto"),
        pose("app_excel", "Excel"),
        pose("app_slides", "PowerPoint"),
        pose("app_blender", "Blender"),
        pose("app_ai", "Chat con l'IA"),
        pose("app_explorer", "Esplora file"),
      ],
    },
  ],
  system: [{ items: [pose("sleep", "Dorme se sei via"), pose("react_welcome", "Bentornato"), pose("react_greet", "Saluto"), pose("react_poke", "Carezza")] }],
};

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
