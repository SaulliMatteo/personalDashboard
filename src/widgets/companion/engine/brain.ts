import type { ActivityEvent, ActivityStatus } from "../../../core/activity/activityBus";
import type { AppId, ForegroundApp } from "./appCategory";
import { ANIMATIONS } from "./animations";
import { EMOTIONS, type EmotionId, type FaceMotion, type GlyphId } from "./face";
import { PERSONALITIES, fillPhrase, type PersonalityId, type PhraseKey } from "./personalities";
import { POSES, resolvePose, type CostumeId, type GazeMode, type PoseId } from "./poses";
import { subjectKind } from "./subjectKind";

/**
 * Il "cervello" del Companion: decide COSA mostrare (posa, reazioni,
 * fumetti) a partire da ciò che succede. Non disegna e non anima nulla:
 * quello è compito di FaceAnimator e del renderer. Com'è fatta ogni posa
 * (espressione, costume, varianti per personalità) sta in poses.ts.
 *
 * Classe pura con orologio e generatore casuale iniettati: si testa
 * senza browser e senza aspettare il tempo vero.
 */

export type Frequency = "rare" | "normal" | "often";

export interface BrainConfig {
  personality: PersonalityId;
  /** Id di animazioni spente (vedi animations.ts). */
  disabled: Set<string>;
  bubbles: boolean;
  bubbleRate: Frequency;
  randomEmotes: boolean;
  emoteRate: Frequency;
  /** Minuti senza mouse/tastiera prima di addormentarsi. */
  idleMinutes: number;
  userName: string;
  /** Soglie del meteo, in °C. */
  hotC: number;
  coldC: number;
}

export interface BrainInput {
  activity: ActivityStatus;
  /** App in primo piano (Windows e macOS, solo se l'utente lo permette), null se ignota o se è la dashboard stessa. */
  foreground: ForegroundApp | null;
  /** Secondi dall'ultimo input dell'utente (di sistema su Windows e macOS, della finestra altrove). */
  idleSeconds: number;
  /** La finestra della dashboard ha il focus. */
  appFocused: boolean;
  hour: number;
}

export interface Reaction {
  /** Posa della reazione (null = solo un'espressione sopra la posa di fondo). */
  pose: PoseId | null;
  emotion: EmotionId;
  glyph: GlyphId | null;
  /** undefined = resta il costume della posa di fondo. */
  costume?: CostumeId | null;
  motion?: FaceMotion;
  gaze?: GazeMode;
  doze?: boolean;
  /** Velocità delle animazioni della reazione (già moltiplicata per la personalità). */
  tempo?: number;
  startedAt: number;
  until: number;
  priority: number;
}

export interface Bubble {
  id: number;
  text: string;
  until: number;
  durationMs: number;
  priority: number;
}

export interface BrainSnapshot {
  pose: PoseId;
  /** Cosa sta facendo, a parole (card, mini, pagina). */
  status: string;
  personality: PersonalityId;
  /** Espressione di fondo della posa corrente. */
  mood: EmotionId;
  gaze: GazeMode;
  /** Simbolo di fondo della posa (es. "z" quando dorme). */
  glyph: GlyphId | null;
  costume: CostumeId | null;
  /** Avanzamento (0..1) per i costumi che lo mostrano, es. la barra del video. */
  costumeValue: number | null;
  /** Movimento della posa (null = quello dell'espressione). */
  motion: FaceMotion | null;
  /** Si appisola e si risveglia di scatto. */
  doze: boolean;
  /** Bagliore dello schermo che scorre sugli occhi. */
  screenGlow: boolean;
  /** Velocità delle animazioni (personalità × posa). */
  tempo: number;
  /** Può guardare il mouse in questo momento. */
  canFollow: boolean;
  reaction: Reaction | null;
  bubble: Bubble | null;
  /** Animazioni accese (già tenuto conto dell'anteprima in corso). */
  blink: boolean;
  wander: boolean;
  breath: boolean;
}

const EMOTE_MEAN_MS: Record<Frequency, number> = { rare: 100_000, normal: 45_000, often: 18_000 };
const CHAT_MEAN_MS: Record<Frequency, number> = { rare: 9 * 60_000, normal: 4 * 60_000, often: 90_000 };
/** Dopo quanto tempo fuori dalla dashboard scatta il "bentornato". */
const WELCOME_AWAY_MS = 3 * 60_000;
/** Stessa frase "di contesto" (es. musica, codice) al massimo ogni… */
const CONTEXT_PHRASE_COOLDOWN_MS = 15 * 60_000;
/**
 * Il player segnala "non in riproduzione" anche durante il buffering:
 * il video resta "in corso" per qualche secondo dopo l'ultimo play.
 */
const VIDEO_GRACE_MS = 10_000;
/**
 * Video/musica/giochi riconosciuti solo dal titolo della finestra (es. una
 * scheda di YouTube in pausa) tengono sveglio al massimo per questo tempo
 * di inattività: dopo, si addormenta comunque.
 */
const PASSIVE_APP_MAX_IDLE_S = 45 * 60;
/** Video senza toccare niente per più di così: si annoia. */
const VIDEO_BORED_IDLE_S = 20 * 60;
/** Da questa durata un video del widget è "un film": occhiali 3D. */
const LONG_VIDEO_S = 40 * 60;
/** Probabilità che un video del widget si guardi col popcorn. */
const POPCORN_CHANCE = 0.35;
/** Trasformazione col meteo: quanto dura e ogni quanto torna. */
const WEATHER_FORM_MS = 6000;
const WEATHER_EVERY_MS: [number, number] = [3 * 60_000, 6 * 60_000];

/** Priorità delle reazioni: una più importante non viene coperta da una minore. */
const PRIORITY = { random: 0, event: 1, study: 2, goal: 3, user: 4 } as const;
type Priority = (typeof PRIORITY)[keyof typeof PRIORITY];

const EMOTE_ANIMS = ANIMATIONS.filter((a) => a.category === "emotes" && a.emotion);
const MUSIC_EMOTES = new Set(["emote_happy", "emote_laugh", "emote_love", "emote_wink"]);
const CALM_EMOTES = new Set(["emote_sleepy", "emote_bored", "emote_curious"]);

/** Emozioni casuali ammesse in ogni posa (assente = nessuna: studio, video, giochi, codice, sonno). */
const EMOTE_POOL: Partial<Record<PoseId, "all" | "music" | "calm" | "rare">> = {
  idle: "all",
  study_break: "all",
  study_wait: "all",
  app_chat: "all",
  app_messages: "all",
  app_browser: "all",
  app_opera: "all",
  app_design: "all",
  app_ai: "all",
  app_explorer: "all",
  app_call: "rare",
  app_office: "rare",
  app_excel: "rare",
  app_slides: "rare",
  app_blender: "rare",
  app_music: "music",
  app_spotify: "music",
  bedtime: "calm",
};

/** Pose in cui guarda il mouse. */
const FOLLOW_POSES = new Set<PoseId>(["idle", "study_break", "study_wait", "app_chat", "app_messages", "app_music", "app_spotify", "app_design", "app_ai", "bedtime"]);
/** Pose in cui chiacchiera spontaneamente (se la dashboard è in primo piano). */
const CHAT_POSES = new Set<PoseId>(["idle", "study_break", "bedtime"]);
/** Pose "passive" (guardi, ascolti, giochi): non dorme anche se non tocchi il mouse. */
const PASSIVE_POSES = new Set<PoseId>(["video_watch", "video_cinema", "app_music", "app_game", "app_spotify", "app_youtube", "app_streaming", "app_live", "app_lol", "app_shooter", "app_minecraft"]);
/** Pose da video: ogni tanto ride, si sorprende, si spaventa o si commuove. */
const VIDEO_POSES = new Set<PoseId>(["video_watch", "video_popcorn", "video_cinema", "video_progress", "video_late", "app_youtube", "app_streaming"]);
/** Pose in cui può trasformarsi col meteo: mai mentre studi, guardi, giochi o dorme. */
const WEATHER_POSES = new Set<PoseId>(["idle", "study_break", "app_chat", "app_messages", "app_music", "app_spotify", "app_browser", "app_opera", "app_office", "app_design", "app_ai", "app_explorer"]);

const APP_POSES: Record<AppId, PoseId> = {
  discord: "app_discord",
  lol: "app_lol",
  opera: "app_opera",
  spotify: "app_spotify",
  youtube: "app_youtube",
  streaming: "app_streaming",
  live: "app_live",
  call: "app_call",
  messages: "app_messages",
  minecraft: "app_minecraft",
  shooter: "app_shooter",
  excel: "app_excel",
  slides: "app_slides",
  blender: "app_blender",
  ai: "app_ai",
  explorer: "app_explorer",
};

const SUBJECT_POSES = {
  math: "study_math",
  science: "study_science",
  lang: "study_lang",
  history: "study_history",
  art: "study_art",
  code: "study_code",
  other: "study",
} as const satisfies Record<ReturnType<typeof subjectKind>, PoseId>;

/** Anteprima dalla pagina: animazione → posa da mostrare per qualche secondo. */
const PREVIEW_POSES: Record<string, PoseId> = {
  study_focus: "study",
  study_read: "study",
  study_book: "study",
  study_subject: "study_math",
  study_break: "study_break",
  video_watch: "video_watch",
  video_glow: "video_watch",
  video_react: "video_watch",
  video_popcorn: "video_popcorn",
  video_cinema: "video_cinema",
  video_bored: "video_bored",
  video_progress: "video_progress",
  video_pause: "video_paused",
  video_late: "video_late",
  sleep_idle: "sleep",
  night: "bedtime",
  bed_blanket: "bed",
  app_react: "app_music",
  app_specific: "app_discord",
};

export function timeOfDayKey(hour: number): PhraseKey {
  if (hour >= 5 && hour < 12) return "greet_morning";
  if (hour >= 12 && hour < 18) return "greet_afternoon";
  if (hour >= 18 && hour < 23) return "greet_evening";
  return "greet_night";
}

const isStudyPose = (pose: PoseId) => pose === "study" || (pose.startsWith("study_") && pose !== "study_break" && pose !== "study_wait");

export class CompanionBrain {
  private readonly now: () => number;
  private readonly random: () => number;
  private config: BrainConfig;
  private input: BrainInput;

  private pose: PoseId = "idle";
  private reaction: Reaction | null = null;
  private bubble: Bubble | null = null;
  private bubbleSeq = 0;
  private lastPhrase = new Map<PhraseKey, string>();
  private lastSaidAt = new Map<PhraseKey, number>();
  private lastEmote: string | null = null;
  private nextEmoteAt: number;
  private nextChatAt: number;
  private nextVideoReactAt: number;
  private nextWeatherAt: number;
  /** Il video in corso si guarda col popcorn (deciso all'inizio di ogni video). */
  private popcorn = false;

  // "Bentornato": quanto tempo l'utente passa fuori dalla dashboard e dove.
  private awaySince: number | null = null;
  private awayApps = new Map<string, number>();
  private lastInputAt: number;

  private preview: { id: string; pose: PoseId | null; until: number } | null = null;
  /** Ultimo istante in cui il video dell'app era in riproduzione. */
  private lastVideoAt = -Infinity;

  private cached: BrainSnapshot | null = null;
  /** Cresce a ogni cambiamento visibile: chi disegna sa quando rileggere. */
  version = 0;

  constructor(options: { now: () => number; random: () => number; config: BrainConfig; input: BrainInput }) {
    this.now = options.now;
    this.random = options.random;
    this.config = options.config;
    this.input = options.input;
    const t = this.now();
    this.lastInputAt = t;
    this.nextEmoteAt = t + this.emoteDelay();
    this.nextChatAt = t + this.chatDelay();
    this.nextVideoReactAt = t + 45_000;
    this.nextWeatherAt = t + 60_000;
    this.pose = this.decidePose();
  }

  // ------------------------------------------------------------------ config

  setConfig(config: BrainConfig): void {
    const rateChanged = config.emoteRate !== this.config.emoteRate || config.personality !== this.config.personality;
    this.config = config;
    if (!config.bubbles) this.bubble = null;
    if (rateChanged) this.nextEmoteAt = this.now() + this.emoteDelay();
    this.pose = this.decidePose();
    this.changed();
  }

  private isOn(id: string): boolean {
    return !this.config.disabled.has(id) || this.preview?.id === id;
  }

  private get personality() {
    return PERSONALITIES[this.config.personality];
  }

  // ------------------------------------------------------------------ input

  /** Da chiamare quando cambia qualcosa di ciò che il Companion osserva (anche spesso: è economico). */
  update(input: BrainInput): void {
    const t = this.now();
    const prev = this.input;
    const elapsed = Math.max(0, t - this.lastInputAt);
    this.lastInputAt = t;
    this.input = input;
    if (input.activity.watchingVideo || prev.activity.watchingVideo) this.lastVideoAt = t;

    // Tempo passato fuori dalla dashboard, per app.
    if (!input.appFocused) {
      if (this.awaySince === null) {
        this.awaySince = t;
        this.awayApps.clear();
      } else if (prev.foreground && !prev.appFocused) {
        const label = prev.foreground.label;
        this.awayApps.set(label, (this.awayApps.get(label) ?? 0) + elapsed);
      }
    }

    const wasAsleep = this.pose === "sleep" || this.pose === "bed";
    const before = this.pose;
    const reactionBefore = this.reaction;
    const bubbleBefore = this.bubble;
    this.pose = this.decidePose();

    // Si sveglia con un saluto solo se l'utente è davvero tornato (ha toccato
    // mouse o tastiera), non se ha smesso di dormire per un altro motivo.
    if (wasAsleep && this.pose !== "sleep" && this.pose !== "bed" && input.idleSeconds < prev.idleSeconds) {
      this.reactPose("react_greet", 1800);
      this.say(timeOfDayKey(input.hour), {}, { spontaneous: false });
    } else if (input.appFocused && !prev.appFocused && this.awaySince !== null) {
      const away = t - this.awaySince;
      if (away >= WELCOME_AWAY_MS && this.isOn("welcome_back")) {
        this.reactPose("react_welcome", 2200);
        const app = this.topAwayApp();
        this.say("welcome_back", { app: app ?? undefined }, { spontaneous: false });
      }
    }
    if (input.appFocused) this.awaySince = null;

    if (before !== this.pose) this.onEnterPose(before, this.pose);
    // Chiamato ogni ~2 s dal polling: segnala un cambiamento solo se c'è davvero.
    if (before !== this.pose || reactionBefore !== this.reaction || bubbleBefore !== this.bubble) this.changed();
  }

  private topAwayApp(): string | null {
    let best: string | null = null;
    let bestMs = 0;
    for (const [label, ms] of this.awayApps) {
      if (ms > bestMs) {
        best = label;
        bestMs = ms;
      }
    }
    return best;
  }

  private decidePose(): PoseId {
    if (this.preview?.pose && this.preview.until > this.now()) return this.preview.pose;
    const { activity, foreground, idleSeconds, hour } = this.input;
    const lateNight = hour < 5;
    // Le attività "passive" (studiare, guardare, ascoltare) vengono PRIMA
    // del sonno: mentre leggi un libro o guardi un film non tocchi il mouse,
    // ma non sei via.
    if (activity.studying) return this.studyPose();
    if (activity.onBreak) return "study_break";
    if (activity.watchingVideo || this.now() - this.lastVideoAt < VIDEO_GRACE_MS) return this.videoPose();
    if (activity.videoPaused && this.isOn("video_pause")) return "video_paused";
    const fromApp = this.poseFromApp(foreground);
    if (fromApp && PASSIVE_POSES.has(fromApp) && idleSeconds < PASSIVE_APP_MAX_IDLE_S) return fromApp;
    if (this.isOn("sleep_idle") && idleSeconds >= this.config.idleMinutes * 60) return lateNight && this.isOn("bed_blanket") ? "bed" : "sleep";
    if (fromApp) return fromApp;
    if (activity.studyPaused) return "study_wait";
    if (lateNight && this.isOn("bed_blanket")) return "bed";
    if (this.isOn("night") && (hour === 23 || lateNight)) return "bedtime";
    return "idle";
  }

  private studyPose(): PoseId {
    if (!this.isOn("study_subject")) return "study";
    return SUBJECT_POSES[subjectKind(this.input.activity.studySubjectName)];
  }

  private videoPose(): PoseId {
    const { activity, idleSeconds, hour } = this.input;
    if ((hour >= 23 || hour < 5) && this.isOn("video_late")) return "video_late";
    if (idleSeconds >= VIDEO_BORED_IDLE_S && this.isOn("video_bored")) return "video_bored";
    if (this.popcorn && this.isOn("video_popcorn")) return "video_popcorn";
    if ((activity.videoDurationSeconds ?? 0) >= LONG_VIDEO_S && this.isOn("video_cinema")) return "video_cinema";
    if (activity.videoProgress !== null && this.isOn("video_progress")) return "video_progress";
    return "video_watch";
  }

  private poseFromApp(foreground: ForegroundApp | null): PoseId | null {
    if (!foreground) return null;
    if (foreground.appId && this.isOn("app_specific")) return APP_POSES[foreground.appId];
    if (!this.isOn("app_react")) return null;
    switch (foreground.category) {
      case "coding":
        return "app_coding";
      case "office":
        return "app_office";
      case "design":
        return "app_design";
      case "game":
        return "app_game";
      case "chat":
        return "app_chat";
      case "music":
        return "app_music";
      case "browser":
        return "app_browser";
      case "video":
        return this.isOn("video_cinema") ? "video_cinema" : "video_watch";
      default:
        return null;
    }
  }

  private onEnterPose(before: PoseId, pose: PoseId): void {
    const t = this.now();
    if (VIDEO_POSES.has(pose) && !VIDEO_POSES.has(before)) {
      this.nextVideoReactAt = t + 45_000 + this.random() * 45_000;
      // Popcorn: si decide una volta per video, non a ogni cambio di posa.
      if (before !== "video_paused") this.popcorn = this.random() < POPCORN_CHANCE;
    }
    const key = POSES[pose].phrase;
    if (!key) return;
    const last = this.lastSaidAt.get(key);
    if (last !== undefined && t - last < CONTEXT_PHRASE_COOLDOWN_MS) return;
    // Non a ogni cambio di app: metà delle volte basta l'espressione.
    if (!VIDEO_POSES.has(pose) && this.random() < 0.5) return;
    this.say(key, {}, { spontaneous: false });
  }

  // ------------------------------------------------------------------ eventi

  handleEvent(event: ActivityEvent): void {
    switch (event.type) {
      case "studyStarted":
        this.react("happy", 1500, undefined, PRIORITY.event);
        this.say("study_start", {}, { cooldownMs: 120_000, priority: PRIORITY.event });
        break;
      case "pomodoroDone":
        if (this.isOn("study_cheer")) this.reactPose("react_pomodoro", 3200, PRIORITY.study);
        this.say("pomodoro_done", {}, { priority: PRIORITY.study });
        break;
      case "breakOver":
        this.say("break_over", {}, { priority: PRIORITY.event });
        break;
      case "studyStopped": {
        const min = Math.round(event.seconds / 60);
        if (min >= 5) {
          this.react("proud", 2600, undefined, PRIORITY.study);
          this.say("study_stopped", { min }, { priority: PRIORITY.study });
        }
        break;
      }
      case "goalReached":
        if (this.isOn("study_goal")) this.reactPose("react_goal", 4500, PRIORITY.goal);
        this.say("goal_reached", {}, { priority: PRIORITY.goal });
        break;
      case "videoEnded":
        if (this.isOn("video_end")) this.reactPose("react_video_end", 4000, PRIORITY.event);
        else this.react("curious", 1800, undefined, PRIORITY.event);
        this.say("video_end", {}, { priority: PRIORITY.event });
        break;
      case "fileReceived":
        this.react("surprised", 1800, undefined, PRIORITY.event);
        this.say("file_received", {}, { priority: PRIORITY.event });
        break;
    }
    this.changed();
  }

  /** Click / carezza dalla pagina di dettaglio. */
  poke(): void {
    this.reactPose("react_poke", 2000, PRIORITY.user);
    this.say("poke", {}, { priority: PRIORITY.user });
    this.changed();
  }

  /** "Dì qualcosa": una frase spontanea subito. */
  chatter(): void {
    this.say("idle", {}, { priority: PRIORITY.user });
    this.changed();
  }

  greet(): void {
    this.reactPose("react_greet", 1800);
    this.say(timeOfDayKey(this.input.hour), {}, { spontaneous: false });
    this.changed();
  }

  /** Anteprima di un'animazione dalla pagina di dettaglio (vale anche se è spenta). */
  previewAnimation(id: string): void {
    const t = this.now();
    const def = ANIMATIONS.find((a) => a.id === id);
    if (!def) return;
    this.preview = { id, pose: PREVIEW_POSES[id] ?? null, until: t + 5000 };
    this.reaction = null;
    if (def.emotion) this.react(def.emotion, 3000, undefined, PRIORITY.user);
    else if (id === "study_cheer") this.handleEvent({ type: "pomodoroDone" });
    else if (id === "study_goal") this.handleEvent({ type: "goalReached" });
    else if (id === "video_end") this.handleEvent({ type: "videoEnded" });
    else if (id === "weather_hot" || id === "weather_cold") this.weatherForm(id === "weather_hot", PRIORITY.user);
    else if (id === "welcome_back") {
      this.reactPose("react_welcome", 2200, PRIORITY.user);
      this.say("welcome_back", { app: "VS Code" }, { priority: PRIORITY.user });
    } else if (id === "video_react") {
      this.nextVideoReactAt = t + 600;
    }
    this.pose = this.decidePose();
    this.changed();
  }

  /** Anteprima di una posa dalla galleria della pagina di dettaglio. */
  previewPose(pose: PoseId, durationMs = 4500): void {
    const t = this.now();
    this.reaction = null;
    // Le reazioni stanno sopra la posa di fondo: si mostrano come tali.
    if (pose.startsWith("react_")) {
      this.preview = null;
      this.reactPose(pose, durationMs, PRIORITY.user);
    } else {
      this.preview = { id: `pose:${pose}`, pose, until: t + durationMs };
    }
    this.pose = this.decidePose();
    this.changed();
  }

  // ------------------------------------------------------------------ tempo

  /** Da chiamare spesso (es. ogni 250 ms): scadenze, emozioni casuali, chiacchiere. */
  tick(): void {
    const t = this.now();
    let dirty = false;

    if (this.preview && this.preview.until <= t) {
      this.preview = null;
      dirty = true;
    }
    // Alcune condizioni scadono col tempo (anteprima, coda del video): si ridecide.
    const decided = this.decidePose();
    if (decided !== this.pose) {
      const before = this.pose;
      this.pose = decided;
      this.onEnterPose(before, decided);
      dirty = true;
    }
    if (this.reaction && this.reaction.until <= t) {
      this.reaction = null;
      dirty = true;
    }
    if (this.bubble && this.bubble.until <= t) {
      this.bubble = null;
      dirty = true;
    }

    if (t >= this.nextEmoteAt) {
      this.nextEmoteAt = t + this.emoteDelay();
      if (this.reaction === null && this.tryRandomEmote()) dirty = true;
    }

    if (VIDEO_POSES.has(this.pose) && this.isOn("video_react") && t >= this.nextVideoReactAt) {
      this.nextVideoReactAt = t + 45_000 + this.random() * 75_000;
      if (this.reaction === null) {
        this.videoReaction();
        dirty = true;
      }
    }

    if (t >= this.nextWeatherAt) {
      this.nextWeatherAt = t + WEATHER_EVERY_MS[0] + this.random() * (WEATHER_EVERY_MS[1] - WEATHER_EVERY_MS[0]);
      const temp = this.input.activity.weatherTemperature;
      if (temp !== null && this.reaction === null && WEATHER_POSES.has(this.pose)) {
        const hot = temp >= this.config.hotC && this.isOn("weather_hot");
        const cold = temp <= this.config.coldC && this.isOn("weather_cold");
        if (hot || cold) {
          this.weatherForm(hot, PRIORITY.random);
          dirty = true;
        }
      }
    }

    if (t >= this.nextChatAt) {
      this.nextChatAt = t + this.chatDelay();
      if (CHAT_POSES.has(this.pose) && this.input.appFocused) {
        if (this.say("idle", {}, { spontaneous: true })) dirty = true;
      }
    }

    if (dirty) this.changed();
  }

  private videoReaction(): void {
    const r = this.random();
    if (r < 0.4) this.react("laugh", 2000, undefined, PRIORITY.random);
    else if (r < 0.7) this.react("surprised", 2000, undefined, PRIORITY.random);
    else if (r < 0.88) {
      this.reactPose("react_scared", 3500, PRIORITY.random);
      this.say("video_scared", {}, { spontaneous: true });
    } else {
      this.reactPose("react_moved", 4000, PRIORITY.random);
      this.say("video_moved", {}, { spontaneous: true });
    }
  }

  private weatherForm(hot: boolean, priority: Priority): void {
    this.reactPose(hot ? "react_hot" : "react_cold", WEATHER_FORM_MS, priority);
    this.say(hot ? "hot" : "cold", {}, { cooldownMs: CONTEXT_PHRASE_COOLDOWN_MS, priority });
  }

  private emoteDelay(): number {
    const mean = EMOTE_MEAN_MS[this.config.emoteRate] / this.personality.emoteRate;
    return mean * (0.5 + this.random());
  }

  private chatDelay(): number {
    const mean = CHAT_MEAN_MS[this.config.bubbleRate] / this.personality.chattiness;
    return mean * (0.5 + this.random());
  }

  private tryRandomEmote(): boolean {
    if (!this.config.randomEmotes) return false;
    const kind = EMOTE_POOL[this.pose];
    if (!kind) return false;
    let pool = EMOTE_ANIMS.filter((a) => !this.config.disabled.has(a.id));
    if (kind === "music") pool = pool.filter((a) => MUSIC_EMOTES.has(a.id));
    if (kind === "calm") pool = pool.filter((a) => CALM_EMOTES.has(a.id));
    if (kind === "rare" && this.random() > 0.35) return false; // mentre lavori disturba meno
    if (pool.length > 1 && this.lastEmote) pool = pool.filter((a) => a.id !== this.lastEmote);
    if (pool.length === 0) return false;

    const weights = pool.map((a) => this.personality.emoteWeights[a.id] ?? 1);
    const total = weights.reduce((s, w) => s + w, 0);
    if (total <= 0) return false;
    let r = this.random() * total;
    let picked = pool[pool.length - 1];
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r < 0) {
        picked = pool[i];
        break;
      }
    }
    this.lastEmote = picked.id;
    const emotion = picked.emotion as EmotionId;
    this.react(emotion, emotion === "sleepy" ? 3800 : 2200 + this.random() * 1300, undefined, PRIORITY.random);
    return true;
  }

  // ------------------------------------------------------------------ uscite

  /** Un'espressione sopra la posa di fondo (che tiene costume e movimento). */
  private react(emotion: EmotionId, durationMs: number, glyph?: GlyphId, priority: Priority = PRIORITY.event): void {
    const t = this.now();
    // Es. "obiettivo raggiunto" non viene coperto dal "pomodoro finito" che arriva subito dopo.
    if (this.reaction && this.reaction.until > t && this.reaction.priority > priority) return;
    this.reaction = { pose: null, emotion, glyph: glyph ?? EMOTIONS[emotion].glyph ?? null, startedAt: t, until: t + durationMs, priority };
  }

  /** Una reazione con la sua posa completa, nella versione della personalità. */
  private reactPose(id: PoseId, durationMs: number, priority: Priority = PRIORITY.event): void {
    const t = this.now();
    if (this.reaction && this.reaction.until > t && this.reaction.priority > priority) return;
    const spec = resolvePose(id, this.config.personality);
    this.reaction = {
      pose: id,
      emotion: spec.mood,
      glyph: spec.glyph !== undefined ? spec.glyph : (EMOTIONS[spec.mood].glyph ?? null),
      costume: spec.costume ?? null,
      motion: spec.motion,
      gaze: spec.gaze,
      doze: spec.doze ?? false,
      tempo: this.personality.tempo * (spec.speed ?? 1),
      startedAt: t,
      until: t + durationMs,
      priority,
    };
  }

  /**
   * Mostra un fumetto. `spontaneous` = chiacchiera non richiesta: non
   * interrompe un fumetto già visibile. Ritorna true se ha parlato.
   */
  private say(
    key: PhraseKey,
    vars: { app?: string; min?: number } = {},
    options: { spontaneous?: boolean; cooldownMs?: number; priority?: number } = {}
  ): boolean {
    if (!this.config.bubbles) return false;
    const t = this.now();
    const spontaneous = options.spontaneous ?? false;
    const priority = spontaneous ? PRIORITY.random : (options.priority ?? PRIORITY.event);
    if (spontaneous && this.bubble) return false;
    if (this.bubble && this.bubble.until > t && this.bubble.priority > priority) return false;
    const last = this.lastSaidAt.get(key);
    if (options.cooldownMs && last !== undefined && t - last < options.cooldownMs) return false;

    const pool = this.personality.phrases[key];
    if (!pool || pool.length === 0) return false;
    const prev = this.lastPhrase.get(key);
    const candidates = pool.length > 1 ? pool.filter((p) => p !== prev) : pool;
    const template = candidates[Math.floor(this.random() * candidates.length)];
    const text = fillPhrase(template, { name: this.config.userName.trim() || undefined, ...vars });

    this.lastPhrase.set(key, template);
    this.lastSaidAt.set(key, t);
    const duration = Math.min(7000, Math.max(3000, 2200 + text.length * 60));
    this.bubble = { id: ++this.bubbleSeq, text, until: t + duration, durationMs: duration, priority };
    return true;
  }

  private changed(): void {
    this.cached = null;
    this.version++;
  }

  snapshot(): BrainSnapshot {
    if (this.cached) return this.cached;
    const pose = this.pose;
    const spec = resolvePose(pose, this.config.personality);
    const base = this.personality.baseMood;
    let mood = spec.mood;
    let gaze = spec.gaze;
    let costume = spec.costume ?? null;

    // Le animazioni spente tolgono il loro pezzo, la posa resta.
    if (isStudyPose(pose)) {
      if (!this.isOn("study_focus")) mood = base;
      gaze = this.isOn("study_read") ? "read" : this.isOn("study_focus") ? "down" : "wander";
      if (!this.isOn("study_book")) costume = null;
    }
    if (mood === "watching" && !this.isOn("video_watch")) mood = base;
    // "idle" usa l'umore di fondo della personalità (es. rilassato per il Calmo).
    if (pose === "idle") mood = base;

    this.cached = {
      pose,
      status: spec.label,
      personality: this.config.personality,
      mood,
      gaze,
      glyph: spec.glyph !== undefined ? spec.glyph : (EMOTIONS[mood].glyph ?? null),
      costume,
      costumeValue: costume === "progress" ? this.input.activity.videoProgress : null,
      motion: spec.motion ?? null,
      doze: spec.doze ?? false,
      screenGlow: (spec.glow ?? false) && this.isOn("video_glow"),
      tempo: this.personality.tempo * (spec.speed ?? 1),
      canFollow: this.isOn("follow") && FOLLOW_POSES.has(pose),
      reaction: this.reaction,
      bubble: this.bubble,
      blink: this.isOn("blink"),
      wander: this.isOn("wander"),
      breath: this.isOn("breath"),
    };
    return this.cached;
  }
}
