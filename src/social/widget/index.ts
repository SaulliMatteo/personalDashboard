import { SIZE_L, SIZE_M, SIZE_S } from "../../core/widgets/sizes";
import type { WidgetDefinition } from "../../core/widgets/types";
import GroupsWidget from "./GroupsWidget";
import GroupsPage from "./GroupsPage";

/**
 * Il widget Gruppi: la parte dei Gruppi che sta in dashboard. Vive in social/ (non in widgets/) perché legge i
 * moduli dei Gruppi; widgets/registry.ts lo importa solo per registrarlo. I provider li monta SocialProviders.
 */
export const groupsWidget: WidgetDefinition = {
  id: "groups",
  name: "Gruppi",
  description: "Chi dei tuoi amici sta studiando adesso e la classifica di oggi, della settimana e del mese (serve un account).",
  component: GroupsWidget,
  sizes: [SIZE_M, SIZE_S, SIZE_L],
  detailComponent: GroupsPage,
  settingsGroup: "groups",
};
