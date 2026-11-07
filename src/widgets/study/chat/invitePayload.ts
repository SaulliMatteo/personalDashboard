import { asCleanText, isRecord } from "../../../core/widgets/chatPayload";

/*
 * Scheda "invito a studiare" nella chat degli amici: materia (nome e colore, facoltativa) e ora (facoltativa).
 * Puro (prova scripts/gruppi/chatCards.test.mts).
 */

export const INVITE_KIND = "study_invite";

export interface InviteCardPayload {
  subject: { name: string; color: string } | null;
  /** "HH:MM", o null = adesso. */
  at: string | null;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const COLOR_RE = /^#[0-9a-f]{6}$/i;

export function invitePayload(invite: InviteCardPayload): Record<string, unknown> {
  return { v: 1, subject: invite.subject, at: invite.at };
}

export function parseInvitePayload(raw: unknown): InviteCardPayload | null {
  if (!isRecord(raw) || raw.v !== 1) return null;
  let subject: InviteCardPayload["subject"] = null;
  if (isRecord(raw.subject)) {
    const name = asCleanText(raw.subject.name, 60);
    const color = typeof raw.subject.color === "string" && COLOR_RE.test(raw.subject.color) ? raw.subject.color.toLowerCase() : null;
    if (name && color) subject = { name, color };
  }
  const at = typeof raw.at === "string" && TIME_RE.test(raw.at) ? raw.at : null;
  return { subject, at };
}

export function describeInvite(p: InviteCardPayload): string {
  return `📚 Invito a studiare${p.subject ? `: ${p.subject.name}` : ""}${p.at ? ` alle ${p.at}` : ""}`;
}
