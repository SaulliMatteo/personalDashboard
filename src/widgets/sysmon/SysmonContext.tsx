import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSettings } from "../../core/settings/useSettings";
import {
  SYSMON_AVAILABLE,
  getCapabilities,
  onSnapshot,
  resetSubscriptions,
  setSampleInterval,
  subscribe,
  unsubscribe,
  type SysmonCapabilities,
  type SysmonInterval,
  type SysmonSnapshot,
} from "./data/sysmonApi";
import { EMPTY_HISTORY, pushAll, type SysmonHistory } from "./lib/history";
import { metricAvailable, type MetricId } from "./lib/metrics";
import { SysmonContext, type SysmonContextValue } from "./useSysmon";

/** Quanti componenti vogliono le misure, per tipo. */
interface Feeds {
  widget: number;
  detail: number;
}

function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
}

/**
 * Misure del Monitor di sistema condivise tra widget e pagina di dettaglio. Il provider è sempre montato ma non
 * misura nulla da solo: si iscrive al campionatore in Rust solo mentre c'è almeno un `useSysmonFeed` montato e la
 * finestra è visibile (a finestra ridotta a icona il campionatore si ferma).
 */
export function SysmonProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const visible = useDocumentVisible();
  const [capabilities, setCapabilities] = useState<SysmonCapabilities | null>(null);
  const [snapshot, setSnapshot] = useState<SysmonSnapshot | null>(null);
  const [history, setHistory] = useState<SysmonHistory>(EMPTY_HISTORY);
  const [feeds, setFeeds] = useState<Feeds>({ widget: 0, detail: 0 });

  // Avvio: le iscrizioni di una pagina ricaricata non le toglierebbe più nessuno; poi capacità ed evento.
  useEffect(() => {
    if (!SYSMON_AVAILABLE) return;
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    void resetSubscriptions().catch(() => {});
    getCapabilities()
      .then((caps) => !cancelled && setCapabilities(caps))
      .catch(() => {});
    onSnapshot((snap) => {
      setSnapshot(snap);
      const gpu = snap.gpus.find((g) => g.usage != null)?.usage ?? null;
      const { used, total } = snap.memory;
      setHistory((h) =>
        pushAll(h, snap.atMs, {
          cpu: snap.cpu.usage,
          gpu,
          memory: used != null && total ? (used / total) * 100 : null,
          rx: snap.network.rxBps,
          tx: snap.network.txBps,
        })
      );
    })
      .then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const interval = Number(settings.sysmonInterval) as SysmonInterval;
  useEffect(() => {
    if (SYSMON_AVAILABLE) void setSampleInterval(interval).catch(() => {});
  }, [interval]);

  const wantWidget = visible && feeds.widget > 0;
  const wantDetail = visible && feeds.detail > 0;
  useEffect(() => {
    if (!SYSMON_AVAILABLE || !wantWidget) return;
    void subscribe(false).catch(() => {});
    return () => void unsubscribe(false).catch(() => {});
  }, [wantWidget]);
  useEffect(() => {
    if (!SYSMON_AVAILABLE || !wantDetail) return;
    void subscribe(true).catch(() => {});
    return () => void unsubscribe(true).catch(() => {});
  }, [wantDetail]);

  const acquire = useCallback((detail: boolean) => {
    const key: keyof Feeds = detail ? "detail" : "widget";
    setFeeds((f) => ({ ...f, [key]: f[key] + 1 }));
    return () => setFeeds((f) => ({ ...f, [key]: Math.max(0, f[key] - 1) }));
  }, []);

  const isAvailable = useCallback((id: MetricId) => metricAvailable(capabilities, id), [capabilities]);

  const value = useMemo<SysmonContextValue>(
    () => ({ available: SYSMON_AVAILABLE, capabilities, snapshot, history, isAvailable, acquire }),
    [capabilities, snapshot, history, isAvailable, acquire]
  );
  return <SysmonContext.Provider value={value}>{children}</SysmonContext.Provider>;
}
