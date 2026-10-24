import type { SocialModule } from "./types";
import { pixyModule } from "./modules/pixy";
import { studyModule } from "./modules/study";

/**
 * L'UNICO elenco dei moduli dei Gruppi. Per aggiungerne uno:
 *  1. crea src/social/modules/<nome>/ con un index.ts che esporta un SocialModule;
 *  2. aggiungilo qui sotto (e la sua feature_key lato server, vedi docs/GRUPPI.md).
 * Provider (e, dalla Fase 5, le sezioni della pagina del gruppo) si aggiornano da soli.
 */
export const SOCIAL_MODULES: SocialModule[] = [studyModule, pixyModule];
