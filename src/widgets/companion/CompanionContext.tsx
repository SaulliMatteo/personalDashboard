import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getActivity, subscribeActivity, subscribeActivityEvents } from "../../core/activity/activityBus";
import { useLayout } from "../../core/layout/useLayout";
import { useSettings } from "../../core/settings/useSettings";
import { useLatestRef } from "../../core/hooks/useLatestRef";
import { useThemeVariant } from "../../core/theme/variants";
import { setNotificationDecorator } from "../../core/notify/notifier";
import { CompanionBrain, type BrainConfig, type BrainInput } from "./engine/brain";
import { FaceAnimator, type FaceFrame } from "./engine/animator";
import { classifyApp, parseAppCategories, serializeAppCategories, type AppCategory, type ForegroundApp } from "../../core/system/appCategory";
import { parseDisabled, serializeDisabled } from "./engine/animations";
import type { PoseId } from "./engine/poses";
import { PERSONALITIES } from "./engine/personalities";
import { readSystemSnapshot } from "../../core/system/systemApi";
import { FACE_STYLES } from "./render/styles";
import { pixyLook, pixyText } from "./notify/pixyNotifications";
import { renderNotificationFace } from "./notify/renderNotificationFace";
import { COMPANION_WIDGET_ID, CompanionContext, type CompanionContextValue, type SeenApp } from "./useCompanion";

/**
 * UN SOLO Companion per tutta l'app: cervello + animatore vivono qui e i
 * componenti che lo disegnano (widget, copia fantasma del drag, pagina di
 * dettaglio) leggono tutti lo stesso fotogramma. Così durante il drag non
 * compaiono due facce diverse.
 */

const TICK_MS = 250;
const POLL_MS = 2000;
/** Per quanto tempo dopo l'ultimo movimento il Companion guarda ancora il mouse. */
const POINTER_FRESH_MS = 2500;
/** Quante app ricorda (solo in memoria) per la lista "App viste" della pagina. */
const SEEN_APPS_MAX = 10;
const NO_CHOICES = new Map<string, AppCategory>();

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
      hotC: settings.companionHotC,
      coldC: settings.companionColdC,
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
      settings.companionHotC,
      settings.companionColdC,
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
  const [seenApps, setSeenApps] = useState<SeenApp[]>([]);
  const appChoices = useMemo(() => parseAppCategories(settings.companionAppCategories), [settings.companionAppCategories]);
  const appChoicesRef = useLatestRef(appChoices);

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

  // --- Segnali di sistema (Windows e macOS) + inattività. Solo se il Companion è in uso.
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
      const raw = snap?.foreground && !snap.foreground.isSelf && cfg.companionWatchForegroundApp ? snap.foreground : null;
      // La categoria "automatica" serve alla lista "App viste": lì l'utente vede cosa ha capito e la corregge.
      const auto = raw ? classifyApp(raw.process, raw.description, raw.title, NO_CHOICES) : null;
      const fg = raw && auto && appChoicesRef.current.has(auto.processKey) ? classifyApp(raw.process, raw.description, raw.title, appChoicesRef.current) : auto;

      setIdleSeconds(idle);
      setForeground((prev) =>
        prev?.processKey === fg?.processKey && prev?.category === fg?.category && prev?.appId === fg?.appId && prev?.label === fg?.label ? prev : fg
      );
      if (auto && auto.processKey) {
        setSeenApps((prev) => {
          const first = prev[0];
          if (first && first.processKey === auto.processKey && first.autoCategory === auto.category && first.label === auto.label) return prev;
          const rest = prev.filter((a) => a.processKey !== auto.processKey);
          return [{ processKey: auto.processKey, label: auto.label, autoCategory: auto.category }, ...rest].slice(0, SEEN_APPS_MAX);
        });
      }
      pushInput({ idleSeconds: idle, foreground: fg });
    }

    void poll();
    const interval = window.setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [active, pushInput, settingsRef, appChoicesRef, settings.companionWatchForegroundApp]);

  // --- Notifiche dell'app: le firma Pixy (faccia nello stile del tema, emoji, frase della
  // personalità). Il provider è sempre montato, quindi vale anche se Pixy non è in dashboard.
  const faceStyleRef = useLatestRef(useThemeVariant(FACE_STYLES));
  useEffect(() => {
    setNotificationDecorator(async (n) => {
      const cfg = settingsRef.current;
      const personality = PERSONALITIES[cfg.companionPersonality];
      const look = pixyLook(n);
      const text = pixyText(n, look, {
        companionName: cfg.companionName,
        personality: personality.id,
        userName: cfg.userName,
        random: Math.random,
      });
      const imageDataUrl = renderNotificationFace(look, {
        style: faceStyleRef.current,
        tweak: personality.faceTweak,
        showMouth: cfg.companionShowMouth,
        useAccent: cfg.companionColor === "accent",
        // Una faccia già a schermo porta i token del suo pigmento (Opaco); altrimenti la radice.
        tokensFrom: document.querySelector(".companion-face") ?? document.documentElement,
      });
      return { ...text, imageDataUrl };
    });
    return () => setNotificationDecorator(null);
  }, [settingsRef, faceStyleRef]);

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
    (id: string | string[], enabled: boolean) => {
      const next = parseDisabled(settingsRef.current.companionDisabledAnimations);
      for (const one of Array.isArray(id) ? id : [id]) {
        if (enabled) next.delete(one);
        else next.add(one);
      }
      updateSetting("companionDisabledAnimations", serializeDisabled(next));
    },
    [settingsRef, updateSetting]
  );

  const setAppCategory = useCallback(
    (processKey: string, category: AppCategory | null) => {
      const next = new Map(parseAppCategories(settingsRef.current.companionAppCategories));
      if (category) next.set(processKey, category);
      else next.delete(processKey);
      updateSetting("companionAppCategories", serializeAppCategories(next));
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
      previewPose: (pose: PoseId, durationMs?: number) => {
        brain.previewPose(pose, durationMs);
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
      seenApps,
      appChoices,
      setAppCategory,
      disabled,
      sampleFrame,
      setAnimationEnabled,
      ...actions,
    }),
    [snapshot, foreground, idleSeconds, systemSupported, seenApps, appChoices, setAppCategory, disabled, sampleFrame, setAnimationEnabled, actions]
  );

  return <CompanionContext.Provider value={value}>{children}</CompanionContext.Provider>;
}
