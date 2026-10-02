import type { WidgetDefinition } from "../../core/widgets/types";
import { SIZE_S, SIZE_M_WIDE } from "../../core/widgets/sizes";
import TasksWidget from "./TasksWidget";

export const tasksWidget: WidgetDefinition = {
  id: "tasks",
  name: "Attività",
  description: "Quante attività ti restano ancora da completare.",
  component: TasksWidget,
  sizes: [SIZE_S, SIZE_M_WIDE],
  defaultPlacement: { x: 1, y: 0, w: 1, h: 1 },
};
