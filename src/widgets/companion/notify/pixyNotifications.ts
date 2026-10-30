import type { AppNotification } from "../../../core/notify/notifier";
import type { AppCategory } from "../../../core/system/appCategory";
import type { EmotionId, GlyphId } from "../../../core/pixy/engine/face";
import { PERSONALITIES, fillPhrase, type PersonalityId, type PhraseKey } from "../../../core/pixy/engine/personalities";

/**
 * Come Pixy "firma" una notifica dell'app: espressione della faccia, emoji nel
 * titolo e frase detta con la personalità scelta, prima del messaggio normale.
 * Puro (random iniettato): il disegno della faccia è in renderNotificationFace.ts.
 */
export interface PixyLook {
  emotion: EmotionId;
  glyph: GlyphId | null;
  emoji: string;
  phrase: PhraseKey;
}

const APP_EMOJI: Partial<Record<AppCategory, string>> = { game: "🎮", video: "📺", chat: "💬" };

/** null: la notifica resta semplice (un messaggio di un compagno non va firmato da Pixy). */
export function pixyLook(n: AppNotification): PixyLook | null {
  switch (n.kind) {
    case "groupMessage":
      return null;
    case "pomodoroDone":
      return { emotion: "proud", glyph: "star", emoji: "🍅", phrase: "pomodoro_done" };
    case "breakOver":
      return { emotion: "determined", glyph: null, emoji: "📚", phrase: "break_over" };
    case "autoStopWarning":
      return { emotion: "surprised", glyph: "exclaim", emoji: "⏳", phrase: "autostop_warning" };
    case "autoStopped":
      if (n.reason === "app") {
        return { emotion: "serious", glyph: null, emoji: (n.category && APP_EMOJI[n.category]) || "⏹", phrase: "autostop_app" };
      }
      return { emotion: "sleepy", glyph: "z", emoji: "😴", phrase: "autostop_idle" };
  }
}

export interface PixyText {
  title: string;
  lines: string[];
}

export function pixyText(
  n: AppNotification,
  look: PixyLook,
  opts: { companionName: string; personality: PersonalityId; userName: string; random: () => number }
): PixyText {
  const phrases = PERSONALITIES[opts.personality].phrases[look.phrase];
  const template = phrases[Math.floor(opts.random() * phrases.length)] ?? "";
  const name = opts.companionName.trim() || "Pixy";
  return {
    title: `${name} ${look.emoji} ${n.title}`,
    lines: [fillPhrase(template, { name: opts.userName.trim() || undefined }), n.body],
  };
}
