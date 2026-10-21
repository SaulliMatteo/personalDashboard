import type { WidgetDefinition } from "../../core/widgets/types";
import { SIZE_S, SIZE_M, SIZE_L, SIZE_XL } from "../../core/widgets/sizes";
import StudyWidget from "./StudyWidget";
import StudyDetail from "./StudyDetail";
import { TimerProvider } from "./timer/TimerContext";
import StudyMini from "./mini/StudyMini";

export const studyWidget: WidgetDefinition = {
  id: "study",
  name: "Studio",
  description: "Timer pomodoro e tempo di studio per materia, con report periodico.",
  component: StudyWidget,
  sizes: [SIZE_M, SIZE_S, SIZE_L, SIZE_XL],
  defaultPlacement: { x: 0, y: 0, w: 2, h: 2 },
  detailComponent: StudyDetail,
  settingsGroup: "study",
  mini: StudyMini,
  // Il timer deve continuare a girare anche se il widget non è in dashboard.
  provider: TimerProvider,
};
