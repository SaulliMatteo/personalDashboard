import { SIZE_L, SIZE_M, SIZE_S, SIZE_W } from "../../core/widgets/sizes";
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
  // sul telefono anche larga: chi studia ora, su una riga
  phoneSizes: [SIZE_W],
  detailComponent: GroupsPage,
  settingsGroup: "groups",
};
