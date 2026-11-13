import { useCallback, useMemo } from "react";
import { useSettings } from "../../core/settings/useSettings";
import { useSysmon } from "./useSysmon";
import { effectiveMetrics, parseMetrics, serializeMetrics, type MetricId, type SysmonSize } from "./lib/metrics";

/**
 * La scelta delle metriche (impostazione `sysmonMetrics`, di questo dispositivo) per una taglia: quelle da mostrare
 * e la funzione che salva una scelta nuova.
 */
export function useMetricChoice(size: SysmonSize) {
  const { settings, updateSetting } = useSettings();
  const { isAvailable } = useSysmon();
  const saved = useMemo(() => parseMetrics(settings.sysmonMetrics), [settings.sysmonMetrics]);
  const shown = useMemo(() => effectiveMetrics(saved, size, isAvailable), [saved, size, isAvailable]);
  const save = useCallback((ids: readonly MetricId[]) => updateSetting("sysmonMetrics", serializeMetrics(ids)), [updateSetting]);
  return { saved, shown, save };
}
