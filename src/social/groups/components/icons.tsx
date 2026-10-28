import type { ReactNode } from "react";

/* Icone dei mockup dei Gruppi (docs/mockup-gruppi/gruppi/). */

export function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

export function AlertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h0" />
    </svg>
  );
}

export function OfflineIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M2 8.8a15 15 0 0 1 20 0M5 12.6a10 10 0 0 1 14 0M8.5 16.4a5 5 0 0 1 7 0M3 3l18 18" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function EnterIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
    </svg>
  );
}

export function ExternalIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M7 17L17 7M9 7h8v8" />
    </svg>
  );
}

export function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** Disegno di un'icona piccola a tratto, come quelle dei Messaggi e del Da fare nel mockup. */
function Stroke({ size, width = 1.8, children }: { size: number; width?: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export function SendIcon() {
  return <Stroke size={17} width={2}><path d="M4 12l16-8-6 16-3-7-7-1z" /></Stroke>;
}

export function TrashIcon() {
  return <Stroke size={14}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></Stroke>;
}

export function ThumbUpIcon() {
  return <Stroke size={13} width={1.9}><path d="M7 10v10H4V10h3zM7 10l4-7a2 2 0 0 1 3 2l-1 4h6a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 17.6 20H7" /></Stroke>;
}

export function FireIcon() {
  return <Stroke size={13} width={1.9}><path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5z" /></Stroke>;
}

export function JoinIcon() {
  return <Stroke size={13} width={2}><path d="M15 19a6 6 0 0 0-12 0M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M16 11h6" /></Stroke>;
}

export function StarIcon() {
  return <Stroke size={13} width={2}><path d="M12 3l2.6 5.6 6 .7-4.5 4 1.3 6-5.4-3.1-5.4 3.1 1.3-6-4.5-4 6-.7z" /></Stroke>;
}

export function ChatEmptyIcon() {
  return <Stroke size={22} width={1.6}><path d="M4 5h16v11H9l-5 4z" /></Stroke>;
}

export function NoSignalIcon() {
  return <Stroke size={22} width={1.6}><path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 19h.01M3 3l18 18" /></Stroke>;
}

/** "Solo per chi è connesso adesso". */
export function LiveIcon() {
  return <Stroke size={11} width={2}><circle cx="12" cy="12" r="3" /><path d="M5 12a7 7 0 0 1 14 0M2 12a10 10 0 0 1 20 0" /></Stroke>;
}

export function LockIcon() {
  return <Stroke size={13} width={2}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Stroke>;
}

export function EyeIcon() {
  return <Stroke size={13} width={2}><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="2.5" /></Stroke>;
}

export function SmallPlusIcon() {
  return <Stroke size={16} width={2.2}><path d="M12 5v14M5 12h14" /></Stroke>;
}

export function SmallCloseIcon() {
  return <Stroke size={14}><path d="M6 6l12 12M18 6L6 18" /></Stroke>;
}

export function ChevronIcon() {
  return <Stroke size={12} width={2.2}><path d="M9 6l6 6-6 6" /></Stroke>;
}

/** Voce fatta / da fare nel foglietto di un compagno (solo lettura). */
export function DoneMarkIcon() {
  return <Stroke size={13} width={2.2}><path d="M5 12.5l4.5 4.5L19 7.5" /></Stroke>;
}

export function OpenMarkIcon() {
  return <Stroke size={13} width={2}><rect x="5" y="5" width="14" height="14" rx="3" /></Stroke>;
}

/** Cerchio che gira: "Completa l'accesso nel browser". */
export function Spinner() {
  return (
    <svg className="grp-spinner" width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
      <circle cx="28" cy="28" r="24" fill="none" stroke="var(--track)" strokeWidth="3" />
      <path d="M28 4a24 24 0 0 1 24 24" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
