import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getActivity, subscribeActivity, subscribeActivityEvents } from "../../core/activity/activityBus";
import { useLayout } from "../../core/layout/LayoutContext";
import { useSettings } from "../../core/settings/SettingsContext";
import { useLatestRef } from "../../core/hooks/useLatestRef";
import { CompanionBrain, type BrainConfig, type BrainInput, type BrainSnapshot } from "./engine/brain";
import { FaceAnimator, type FaceFrame } from "./engine/animator";
import { classifyApp, type ForegroundApp } from "./engine/appCategory";
import { parseDisabled, serializeDisabled } from "./engine/animations";
import { PERSONALITIES } from "./engine/personalities";
import { readSystemSnapshot } from "./data/systemApi";

/**
 * UN SOLO Companion per tutta l'app: cervello + animatore vivono qui e i
 * componenti che lo disegnano (widget, copia fantasma del drag, pagina di
 * dettaglio) leggono tutti lo stesso fotogramma. Così durante il drag non
 * compaiono due facce diverse.
 */

export const COMPANION_WIDGET_ID = "companion";

const TICK_MS = 250;
const POLL_MS = 2000;
/** Per quanto tempo dopo l'ultimo movimento il Companion guarda ancora il mouse. */
const POINTER_FRESH_MS = 2500;

interface CompanionContextValue {
  snapshot: BrainSnapshot;
  /** App in primo piano riconosciuta (solo Windows, se permesso). */
  foreground: ForegroundApp | null;
  idleSeconds: number;
  /** True se i segnali di sistema (Windows) arrivano davvero. */
  systemSupported: boolean;
  disabled: Set<string>;
  /** Fotogramma all'istante `t` (performance.now). `rect` = dove è disegnato, per guardare il mouse. */
  sampleFrame: (t: number, rect: DOMRect | null) => FaceFrame;
  poke: () => void;
  chatter: () => void;
  previewAnimation: (id: string) => void;
  setAnimationEnabled: (id: string, enabled: boolean) => void;
  /** La pagina di dettaglio lo chiama finché è aperta: tiene vivo il polling anche senza widget in dashboard. */
  retain: () => () => void;
}

const CompanionContext = createContext<CompanionContextValue | undefined>(undefined);

function makeInitialInput(): BrainInput {
  return {
    activity: getActivity(),
    foreground: null,
    idleSeconds: 0,
    appFocused: typeof document !== "undefined" ? document.hasFocus() : true,
    hour: new Date().getHours(),
  };
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function CompanionProvider({ children }: { children: ReactNode }) {
  const { settings, updateSetting } = useSettings();
  const { layout } = useLayout();

  const disabled = useMemo(() => parseDisabled(settings.companionDisabledAnimations), [settings.companionDisabledAnimations]);

  const config: BrainConfig = useMemo(
    () => ({
      personality: settings.companionPersonality,
      disabled,
      bubbles: settings.companionBubbles,
      bubbleRate: settings.companionBubbleRate,
      randomEmotes: settings.companionRandomEmotes,
      emoteRate: settings.companionEmoteRate,
      idleMinutes: settings.companionIdleMinutes,
      userName: settings.userName,
    }),
    [
      settings.companionPersonality,
      disabled,
      settings.companionBubbles,
      settings.companionBubbleRate,
      settings.companionRandomEmotes,
      settings.companionEmoteRate,
      settings.companionIdleMinutes,
      settings.userName,
    ]
  );

  // Creati una volta sola (inizializzatore pigro di useState).
  const [initialInput] = useState(makeInitialInput);
  const [brain] = useState(() => new CompanionBrain({ now: () => Date.now(), random: Math.random, config, input: initialInput }));
  const [animator] = useState(() => new FaceAnimator());
  // Input correnti (ref: li legge il polling senza richiudere gli effect).
  const inputRef = useRef<BrainInput>(initialInput);

  const [version, setVersion] = useState(0);
  const [foreground, setForeground] = useState<ForegroundApp | null>(null);
  const [idleSeconds, setIdleSeconds] = useState(0);
  const [systemSupported, setSystemSupported] = useState(false);
  const [retainCount, setRetainCount] = useState(0);

  const placed = layout.some((item) => item.i === COMPANION_WIDGET_ID);
  const active = placed || retainCount > 0;

  const settingsRef = useLatestRef(settings);

  const pushInput = useCallback(
    (patch: Partial<BrainInput>) => {
      inputRef.current = { ...inputRef.current, ...patch, hour: new Date().getHours() };
      brain.update(inputRef.current);
      setVersion(brain.version);
    },
    [brain]
  );

  useEffect(() => {
    brain.setConfig(config);
    setVersion(brain.version);
  }, [brain, config]);

  // --- Attività dell'app (Studio, YouTube…) ed eventi.
  useEffect(() => {
    const offStatus = subscribeActivity(() => pushInput({ activity: getActivity() }));
    const offEvents = subscribeActivityEvents((event) => {
      brain.handleEvent(event);
      setVersion(brain.version);
    });
    return () => {
      offStatus();
      offEvents();
    };
  }, [brain, pushInput]);

  // --- Mouse, tastiera, focus della finestra.
  const lastLocalInputRef = useRef(0);
  const pointerRef = useRef<{ x: number; y: number; at: number } | null>(null);
  useEffect(() => {
    lastLocalInputRef.current = Date.now();
    const onInput = () => {
      lastLocalInputRef.current = Date.now();
    };
    const onMove = (e: MouseEvent) => {
      lastLocalInputRef.current = Date.now();
      pointerRef.current = { x: e.clientX, y: e.clientY, at: performance.now() };
    };
    const onFocus = () => pushInput({ appFocused: true });
    const onBlur = () => {
      pointerRef.current = null;
      pushInput({ appFocused: false });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("keydown", onInput);
    window.addEventListener("pointerdown", onInput);
    window.addEventListener("wheel", onInput, { passive: true });
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("keydown", onInput);
      window.removeEventListener("pointerdown", onInput);
      window.removeEventListener("wheel", onInput);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, [pushInput]);

  // --- Segnali di sistema (Windows) + inattività. Solo se il Companion è in uso.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let systemAvailable = true;

    async function poll() {
      const cfg = settingsRef.current;
      const snap = systemAvailable ? await readSystemSnapshot(cfg.companionWatchForegroundApp) : null;
      if (cancelled) return;
      if (snap === null) systemAvailable = false; // fuori da Tauri o sistema non supportato: non riprovare
      setSystemSupported(snap !== null);

      const localIdle = Math.floor((Date.now() - lastLocalInputRef.current) / 1000);
      const idle = snap?.idleSeconds ?? localIdle;
      const fg =
        snap?.foreground && !snap.foreground.isSelf && cfg.companionWatchForegroundApp
          ? classifyApp(snap.foreground.process, snap.foreground.title)
          : null;

      setIdleSeconds(idle);
      setForeground((prev) => (prev?.category === fg?.category && prev?.label === fg?.label ? prev : fg));
      pushInput({ idleSeconds: idle, foreground: fg });
    }

    void poll();
    const interval = window.setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [active, pushInput, settingsRef, settings.companionWatchForegroundApp]);

  // --- Orologio del cervello: scadenze, emozioni casuali, chiacchiere.
  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(() => {
      brain.tick();
      setVersion((v) => (v === brain.version ? v : brain.version));
    }, TICK_MS);
    return () => window.clearInterval(interval);
  }, [active, brain]);

  // Saluto, una volta per avvio, quando il Companion diventa visibile.
  const greetedRef = useRef(false);
  useEffect(() => {
    if (!active || greetedRef.current) return;
    // Il flag si alza solo quando il saluto parte davvero: in StrictMode (o se
    // il Companion sparisce entro 1,2 s) l'effect viene ripulito e riprovato.
    const timeout = window.setTimeout(() => {
      greetedRef.current = true;
      brain.greet();
      setVersion(brain.version);
    }, 1200);
    return () => window.clearTimeout(timeout);
  }, [active, brain]);

  const sampleFrame = useCallback(
    (t: number, rect: DOMRect | null): FaceFrame => {
      const cfg = settingsRef.current;
      let pointer: { x: number; y: number } | null = null;
      const p = pointerRef.current;
      if (p && rect && t - p.at < POINTER_FRESH_MS) {
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        pointer = {
          x: clamp((p.x - cx) / (rect.width / 2 + 160), -1, 1),
          y: clamp((p.y - cy) / (rect.height / 2 + 160), -0.8, 0.8),
        };
      }
      return animator.advance(t, brain.snapshot(), {
        blinkMs: PERSONALITIES[cfg.companionPersonality].blinkMs,
        pointer,
        still: !cfg.animationsEnabled,
      });
    },
    [animator, brain, settingsRef]
  );

  const setAnimationEnabled = useCallback(
    (id: string, enabled: boolean) => {
      const next = parseDisabled(settingsRef.current.companionDisabledAnimations);
      if (enabled) next.delete(id);
      else next.add(id);
      updateSetting("companionDisabledAnimations", serializeDisabled(next));
    },
    [settingsRef, updateSetting]
  );

  const actions = useMemo(
    () => ({
      poke: () => {
        brain.poke();
        setVersion(brain.version);
      },
      chatter: () => {
        brain.chatter();
        setVersion(brain.version);
      },
      previewAnimation: (id: string) => {
        brain.previewAnimation(id);
        setVersion(brain.version);
      },
      retain: () => {
        setRetainCount((n) => n + 1);
        return () => setRetainCount((n) => n - 1);
      },
    }),
    [brain]
  );

  // `version` cambia solo quando cambia qualcosa di visibile: lo snapshot è già in cache nel cervello.
  const snapshot = useMemo(() => brain.snapshot(), [brain, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo<CompanionContextValue>(
    () => ({
      snapshot,
      foreground,
      idleSeconds,
      systemSupported,
      disabled,
      sampleFrame,
      setAnimationEnabled,
      ...actions,
    }),
    [snapshot, foreground, idleSeconds, systemSupported, disabled, sampleFrame, setAnimationEnabled, actions]
  );

  return <CompanionContext.Provider value={value}>{children}</CompanionContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCompanion() {
  const ctx = useContext(CompanionContext);
  if (!ctx) throw new Error("useCompanion deve essere usato dentro <CompanionProvider>");
  return ctx;
}
