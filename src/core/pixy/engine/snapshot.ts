import type { EmotionId, FaceMotion, GlyphId } from "./face";
import type { PersonalityId } from "./personalities";
import type { CostumeId, GazeMode, PoseId } from "./poses";

/*
 * Lo stato del "cervello" di Pixy che serve per animarlo e disegnarlo. Lo produce il Companion
 * (widgets/companion/engine/brain.ts); qui sta solo la forma, così lo può usare anche chi
 * disegna il Pixy di qualcun altro (i Gruppi).
 */

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
