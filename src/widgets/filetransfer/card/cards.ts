import type { ComponentType } from "react";
import type { ThemeVariants } from "../../../core/theme/variants";
import { FtCellFosforo, FtCellNotte, FtCellOpaco } from "./FtCellSignal";
import FtCellQuaderno from "./FtCellQuaderno";

/**
 * Cella 1×1 del File transfer (widget-1x1.html): Notte, Opaco e Fosforo condividono la
 * forma "Segnale", Quaderno ha il foglio a righe.
 * Le taglie 2×1 e 2×2 restano in FileTransferWidget, uguali nei temi.
 */
export const FT_CELLS: ThemeVariants<ComponentType> = {
  notte: FtCellNotte,
  opaco: FtCellOpaco,
  quaderno: FtCellQuaderno,
  fosforo: FtCellFosforo,
};
