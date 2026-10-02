import type { WidgetDefinition } from "../../core/widgets/types";
import { SIZE_S, SIZE_M_SQUARE } from "../../core/widgets/sizes";
import StudyWidget from "./StudyWidget";
import StudyDetail from "./StudyDetail";
import { TimerProvider } from "./TimerContext";

export const studyWidget: WidgetDefinition = {
  id: "study",
  name: "Studio",
  description: "Timer pomodoro e tempo di studio per materia, con report periodico.",
  component: StudyWidget,
  sizes: [SIZE_S, SIZE_M_SQUARE],
  detailComponent: StudyDetail,
  // Il timer deve continuare a girare anche se il widget non è in dashboard.
  provider: TimerProvider,
};
