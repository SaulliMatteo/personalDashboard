import type { WidgetDefinition } from "../../core/widgets/types";
import { SIZE_S, SIZE_M_SQUARE } from "../../core/widgets/sizes";
import StudyWidget from "./StudyWidget";
import StudyDetail from "./StudyDetail";
import { TimerProvider } from "./timer/TimerContext";

export const studyWidget: WidgetDefinition = {
  id: "study",
  name: "Studio",
  description: "Timer pomodoro e tempo di studio per materia, con report periodico.",
  component: StudyWidget,
  sizes: [SIZE_S, SIZE_M_SQUARE],
  // Unico widget rimasto: serve un posto di default, altrimenti primo avvio
  // e "reset posizione" darebbero una dashboard vuota.
  defaultPlacement: { x: 0, y: 0, w: 2, h: 2 },
  detailComponent: StudyDetail,
  settingsGroup: "study",
  // Il timer deve continuare a girare anche se il widget non è in dashboard.
  provider: TimerProvider,
};
