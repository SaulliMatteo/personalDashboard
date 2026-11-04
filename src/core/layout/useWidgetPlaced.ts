import { useCompact } from "./useCompact";
import { useLayout } from "./useLayout";
import { useMobileLayout } from "./useMobileLayout";

/**
 * Il widget è nella dashboard mostrata? Sul telefono conta il layout mobile (core/layout/mobileLayout.ts), altrove
 * quello del desktop: i provider che lavorano solo se il widget è in uso (es. Meteo, Pixy) devono usare questo.
 */
export function useWidgetPlaced(id: string): boolean {
  const compact = useCompact();
  const { layout } = useLayout();
  const { items } = useMobileLayout();
  return (compact ? items : layout).some((item) => item.i === id);
}
