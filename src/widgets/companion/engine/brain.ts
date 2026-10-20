import type { ActivityEvent, ActivityStatus } from "../../../core/activity/activityBus";
import type { ForegroundApp } from "./appCategory";
import { ANIMATIONS } from "./animations";
import { EMOTIONS, type EmotionId, type GlyphId } from "./face";
import { PERSONALITIES, fillPhrase, type PersonalityId, type PhraseKey } from "./personalities";

/**
 * Il "cervello" del Companion: decide COSA mostrare (umore, sguardo,
 * reazioni, fumetti) a partire da ciò che succede. Non disegna e non
 * anima nulla: quello è compito di FaceAnimator e del renderer.
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
}

export interface BrainInput {
  activity: ActivityStatus;
  /** App in primo piano (solo Windows e solo se l'utente lo permette), null se ignota o se è la dashboard stessa. */
  foreground: ForegroundApp | null;
  /** Secondi dall'ultimo input dell'utente (di sistema su Windows, della finestra altrove). */
  idleSeconds: number;
  /** La finestra della dashboard ha il focus. */
  appFocused: boolean;
  hour: number;
}

export type Behavior =
  | "idle"
  | "study"
  | "studyPaused"
  | "break"
  | "video"
  | "music"
  | "coding"
  | "game"
  | "chat"
  | "night"
  | "sleep";

export type GazeMode = "wander" | "read" | "screen" | "down" | "sleep";

export interface Reaction {
  emotion: EmotionId;
  glyph: GlyphId | null;
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
  behavior: Behavior;
  /** Espressione di fondo del comportamento corrente. */
  mood: EmotionId;
  gaze: GazeMode;
  /** Simbolo di fondo del comportamento (es. "z" quando dorme). */
  glyph: GlyphId | null;
  /** Bagliore dello schermo che scorre sugli occhi. */
  screenGlow: boolean;
  /** Dondola a tempo di musica. */
  musicBeat: boolean;
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

/** Priorità delle reazioni: una più importante non viene coperta da una minore. */
const PRIORITY = { random: 0, event: 1, study: 2, goal: 3, user: 4 } as const;
type Priority = (typeof PRIORITY)[keyof typeof PRIORITY];

const EMOTE_ANIMS = ANIMATIONS.filter((a) => a.category === "emotes" && a.emotion);
const MUSIC_EMOTES = new Set(["emote_happy", "emote_laugh", "emote_love", "emote_wink"]);
const CALM_EMOTES = new Set(["emote_sleepy", "emote_bored", "emote_curious"]);

export function timeOfDayKey(hour: number): PhraseKey {
  if (hour >= 5 && hour < 12) return "greet_morning";
  if (hour >= 12 && hour < 18) return "greet_afternoon";
  if (hour >= 18 && hour < 23) return "greet_evening";
  return "greet_night";
}

export class CompanionBrain {
  private readonly now: () => number;
  private readonly random: () => number;
  private config: BrainConfig;
  private input: BrainInput;

  private behavior: Behavior = "idle";
  private reaction: Reaction | null = null;
  private bubble: Bubble | null = null;
  private bubbleSeq = 0;
  private lastPhrase = new Map<PhraseKey, string>();
  private lastSaidAt = new Map<PhraseKey, number>();
  private lastEmote: string | null = null;
  private nextEmoteAt: number;
  private nextChatAt: number;
  private nextVideoReactAt: number;

  // "Bentornato": quanto tempo l'utente passa fuori dalla dashboard e dove.
  private awaySince: number | null = null;
  private awayApps = new Map<string, number>();
  private lastInputAt: number;

  private preview: { id: string; behavior: Behavior | null; until: number } | null = null;
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
    this.behavior = this.decideBehavior();
  }

  // ------------------------------------------------------------------ config

  setConfig(config: BrainConfig): void {
    const rateChanged = config.emoteRate !== this.config.emoteRate || config.personality !== this.config.personality;
    this.config = config;
    if (!config.bubbles) this.bubble = null;
    if (rateChanged) this.nextEmoteAt = this.now() + this.emoteDelay();
    this.behavior = this.decideBehavior();
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

    const wasSleeping = this.behavior === "sleep";
    const before = this.behavior;
    const reactionBefore = this.reaction;
    const bubbleBefore = this.bubble;
    this.behavior = this.decideBehavior();

    // Si sveglia con un saluto solo se l'utente è davvero tornato (ha toccato
    // mouse o tastiera), non se ha smesso di dormire per un altro motivo.
    if (wasSleeping && this.behavior !== "sleep" && input.idleSeconds < prev.idleSeconds) {
      // Sveglio! Un saluto in base all'ora.
      this.react("surprised", 900);
      this.say(timeOfDayKey(input.hour), {}, { spontaneous: false });
    } else if (input.appFocused && !prev.appFocused && this.awaySince !== null) {
      const away = t - this.awaySince;
      if (away >= WELCOME_AWAY_MS && this.isOn("welcome_back")) {
        this.react("happy", 2200);
        const app = this.topAwayApp();
        this.say("welcome_back", { app: app ?? undefined }, { spontaneous: false });
      }
    }
    if (input.appFocused) this.awaySince = null;

    if (before !== this.behavior) this.onEnterBehavior(this.behavior);
    // Chiamato ogni ~2 s dal polling: segnala un cambiamento solo se c'è davvero.
    if (before !== this.behavior || reactionBefore !== this.reaction || bubbleBefore !== this.bubble) this.changed();
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

  private decideBehavior(): Behavior {
    if (this.preview?.behavior && this.preview.until > this.now()) return this.preview.behavior;
    const { activity, foreground, idleSeconds, hour } = this.input;
    // Le attività "passive" (studiare, guardare, ascoltare) vengono PRIMA
    // del sonno: mentre leggi un libro o guardi un film non tocchi il mouse,
    // ma non sei via.
    if (activity.studying) return "study";
    if (activity.onBreak) return "break";
    if (activity.watchingVideo || this.now() - this.lastVideoAt < VIDEO_GRACE_MS) return "video";
    const fromApp = this.behaviorFromApp(foreground);
    const passive = fromApp === "video" || fromApp === "music" || fromApp === "game";
    if (passive && idleSeconds < PASSIVE_APP_MAX_IDLE_S) return fromApp;
    if (this.isOn("sleep_idle") && idleSeconds >= this.config.idleMinutes * 60) return "sleep";
    if (fromApp) return fromApp;
    if (activity.studyPaused) return "studyPaused";
    if (this.isOn("night") && (hour >= 23 || hour < 5)) return "night";
    return "idle";
  }

  private behaviorFromApp(foreground: ForegroundApp | null): Behavior | null {
    if (!foreground || !this.isOn("app_react")) return null;
    switch (foreground.category) {
      case "video":
        return "video";
      case "music":
        return "music";
      case "coding":
      case "office":
      case "design":
        return "coding";
      case "game":
        return "game";
      case "chat":
        return "chat";
      default:
        return null;
    }
  }

  private onEnterBehavior(behavior: Behavior): void {
    const contextual: Partial<Record<Behavior, PhraseKey>> = {
      video: "video_start",
      music: "music",
      coding: "coding",
      game: "game",
      chat: "chat",
      night: "night",
    };
    if (behavior === "video") this.nextVideoReactAt = this.now() + 45_000 + this.random() * 45_000;
    const key = contextual[behavior];
    if (!key) return;
    const last = this.lastSaidAt.get(key);
    if (last !== undefined && this.now() - last < CONTEXT_PHRASE_COOLDOWN_MS) return;
    // Non a ogni cambio di app: metà delle volte basta l'espressione.
    if (behavior !== "video" && this.random() < 0.5) return;
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
        if (this.isOn("study_cheer")) this.react("excited", 3200, "star", PRIORITY.study);
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
        if (this.isOn("study_goal")) this.react("excited", 4500, "spark", PRIORITY.goal);
        this.say("goal_reached", {}, { priority: PRIORITY.goal });
        break;
      case "videoEnded":
        this.react("curious", 1800, undefined, PRIORITY.event);
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
    const options: EmotionId[] = this.config.personality === "grumpy" ? ["angry", "bored", "wink"] : ["happy", "laugh", "shy", "love"];
    this.react(options[Math.floor(this.random() * options.length)], 2000, undefined, PRIORITY.user);
    this.say("poke", {}, { priority: PRIORITY.user });
    this.changed();
  }

  /** "Dì qualcosa": una frase spontanea subito. */
  chatter(): void {
    this.say("idle", {}, { priority: PRIORITY.user });
    this.changed();
  }

  greet(): void {
    this.react("happy", 1800);
    this.say(timeOfDayKey(this.input.hour), {}, { spontaneous: false });
    this.changed();
  }

  /** Anteprima di un'animazione dalla pagina di dettaglio (vale anche se è spenta). */
  previewAnimation(id: string): void {
    const t = this.now();
    const def = ANIMATIONS.find((a) => a.id === id);
    if (!def) return;
    const behaviorFor: Record<string, Behavior> = {
      study_focus: "study",
      study_read: "study",
      study_break: "break",
      video_watch: "video",
      video_glow: "video",
      video_react: "video",
      sleep_idle: "sleep",
      night: "night",
      app_react: "music",
    };
    this.preview = { id, behavior: behaviorFor[id] ?? null, until: t + 5000 };
    this.reaction = null;
    if (def.emotion) this.react(def.emotion, 3000, undefined, PRIORITY.user);
    else if (id === "study_cheer") this.handleEvent({ type: "pomodoroDone" });
    else if (id === "study_goal") this.handleEvent({ type: "goalReached" });
    else if (id === "welcome_back") {
      this.react("happy", 2200, undefined, PRIORITY.user);
      this.say("welcome_back", { app: "VS Code" }, { priority: PRIORITY.user });
    } else if (id === "video_react") {
      this.nextVideoReactAt = t + 600;
    }
    this.behavior = this.decideBehavior();
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
    const decided = this.decideBehavior();
    if (decided !== this.behavior) {
      this.behavior = decided;
      this.onEnterBehavior(decided);
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

    if (this.behavior === "video" && this.isOn("video_react") && t >= this.nextVideoReactAt) {
      this.nextVideoReactAt = t + 45_000 + this.random() * 75_000;
      if (this.reaction === null) {
        this.react(this.random() < 0.55 ? "laugh" : "surprised", 2000, undefined, PRIORITY.random);
        dirty = true;
      }
    }

    if (t >= this.nextChatAt) {
      this.nextChatAt = t + this.chatDelay();
      if (["idle", "break", "night"].includes(this.behavior) && this.input.appFocused) {
        if (this.say("idle", {}, { spontaneous: true })) dirty = true;
      }
    }

    if (dirty) this.changed();
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
    const b = this.behavior;
    let pool = EMOTE_ANIMS.filter((a) => !this.config.disabled.has(a.id));
    if (b === "sleep" || b === "study" || b === "video" || b === "game") return false;
    if (b === "music") pool = pool.filter((a) => MUSIC_EMOTES.has(a.id));
    if (b === "night") pool = pool.filter((a) => CALM_EMOTES.has(a.id));
    if (b === "coding" && this.random() > 0.35) return false; // mentre lavori disturba meno
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

  private react(emotion: EmotionId, durationMs: number, glyph?: GlyphId, priority: Priority = PRIORITY.event): void {
    const t = this.now();
    // Es. "obiettivo raggiunto" non viene coperto dal "pomodoro finito" che arriva subito dopo.
    if (this.reaction && this.reaction.until > t && this.reaction.priority > priority) return;
    this.reaction = { emotion, glyph: glyph ?? EMOTIONS[emotion].glyph ?? null, startedAt: t, until: t + durationMs, priority };
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
    const b = this.behavior;
    const base = this.personality.baseMood;
    let mood: EmotionId = base;
    let gaze: GazeMode = "wander";
    let glyph: GlyphId | null = null;
    let screenGlow = false;
    let musicBeat = false;

    switch (b) {
      case "sleep":
        mood = "sleep";
        gaze = "sleep";
        glyph = "z";
        break;
      case "study":
        if (this.isOn("study_focus")) mood = "focused";
        gaze = this.isOn("study_read") ? "read" : this.isOn("study_focus") ? "down" : "wander";
        break;
      case "studyPaused":
        glyph = "dots";
        break;
      case "break":
        if (this.isOn("study_break")) mood = "relaxed";
        break;
      case "video":
        if (this.isOn("video_watch")) {
          mood = "watching";
          gaze = "screen";
        }
        screenGlow = this.isOn("video_glow");
        break;
      case "music":
        mood = "relaxed";
        glyph = "note";
        musicBeat = true;
        break;
      case "coding":
        mood = "focused";
        gaze = "down";
        break;
      case "game":
        mood = "watching";
        gaze = "screen";
        screenGlow = this.isOn("video_glow");
        break;
      case "chat":
        mood = "curious";
        break;
      case "night":
        mood = "sleepy";
        gaze = "down";
        break;
      case "idle":
        break;
    }

    this.cached = {
      behavior: b,
      mood,
      gaze,
      glyph,
      screenGlow,
      musicBeat,
      canFollow: this.isOn("follow") && ["idle", "break", "studyPaused", "chat", "night", "music"].includes(b),
      reaction: this.reaction,
      bubble: this.bubble,
      blink: this.isOn("blink"),
      wander: this.isOn("wander"),
      breath: this.isOn("breath"),
    };
    return this.cached;
  }
}

export const BEHAVIOR_LABELS: Record<Behavior, string> = {
  idle: "Ti tiene compagnia",
  study: "Studia con te",
  studyPaused: "Aspetta che riprendi",
  break: "In pausa",
  video: "Guarda il video",
  music: "Ascolta la musica",
  coding: "Ti guarda lavorare",
  game: "Fa il tifo",
  chat: "Curiosa in chat",
  night: "Ha sonno",
  sleep: "Dorme",
};
