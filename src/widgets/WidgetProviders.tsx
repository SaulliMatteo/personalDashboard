import type { ReactNode } from "react";
import { WIDGET_REGISTRY } from "./registry";

/**
 * Monta i provider richiesti dai widget (es. il timer di Studio) senza
 * che l'App debba conoscerli uno per uno.
 */
function WidgetProviders({ children }: { children: ReactNode }) {
  return WIDGET_REGISTRY.reduceRight<ReactNode>((inner, widget) => {
    const Provider = widget.provider;
    return Provider ? <Provider>{inner}</Provider> : inner;
  }, children);
}

export default WidgetProviders;
