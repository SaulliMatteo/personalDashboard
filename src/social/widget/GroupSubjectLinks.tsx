import { useEffect, useState } from "react";
import { createGroupSubject, GROUP_SUBJECT_NAME_MAX, type GroupSubject } from "../../core/cloud/groupSubjectsApi";
import type { CloudGroup } from "../../core/cloud/groupsApi";
import { useCloud } from "../../core/cloud/useCloud";
import { useSettings } from "../../core/settings/useSettings";
import { messageOf } from "../groups/messages";
import {
  listLocalSubjects,
  loadSubjectLinks,
  saveSubjectLink,
  updateSubjectPending,
  type LocalSubject,
} from "../modules/study/data/subjectLinksRepository";
import { proposeGroupSubject, suggestedGroupSubjectName } from "../modules/study/subjects/match";
import { resolveGroupSubject, type SubjectLink } from "../modules/study/subjects/subjectPlan";
import { useStudySync } from "../modules/study/useStudySync";
import "./GroupSubjectLinks.css";

/** Valore della select per "Nuova materia del gruppo…" ("" = "Non condividere"). */
const NEW = "+";

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

/**
 * "Le tue materie in questo gruppo": per ogni materia del widget Studio una proposta (subjects/match.ts) da
 * confermare o correggere. Niente si conferma da solo; l'abbinamento resta su questo computer, al server vanno solo
 * i secondi per materia del gruppo. Cambiarlo cancella dal server le righe della materia di prima (se non ci va
 * nessun'altra delle tue) e rimanda lo storico in quella nuova.
 */
function GroupSubjectLinks({
  group,
  subjects,
  onChanged,
  onOpenSharing,
}: {
  group: CloudGroup;
  /** tutte le materie del gruppo, anche quelle unite (per far seguire gli abbinamenti) */
  subjects: GroupSubject[];
  onChanged: () => void;
  onOpenSharing: () => void;
}) {
  const { userId } = useCloud();
  const { settings } = useSettings();
  const { requestSync } = useStudySync();
  const [locals, setLocals] = useState<LocalSubject[]>([]);
  const [links, setLinks] = useState<SubjectLink[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [creating, setCreating] = useState<{ localId: number; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    Promise.all([listLocalSubjects(), loadSubjectLinks(userId)])
      .then(([localList, linkList]) => {
        if (cancelled) return;
        setLocals(localList);
        setLinks(linkList.filter((l) => l.groupId === group.id));
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(messageOf(e));
      });
    return () => {
      cancelled = true;
    };
  }, [userId, group.id, version]);

  const active = subjects.filter((s) => s.mergedInto === null);
  const byId = new Map(subjects.map((s) => [s.id, s] as const));
  const linkOf = (localId: number) => links.find((l) => l.localSubjectId === localId);
  // le archiviate solo se abbinate: così si può ancora togliere l'abbinamento
  const shown = locals.filter((s) => !s.archived || linkOf(s.id)?.groupSubjectId);

  async function confirm(localId: number, target: string | null) {
    if (!userId) return;
    setBusy(true);
    setError(null);
    try {
      const saved = linkOf(localId);
      const before = saved?.groupSubjectId ? resolveGroupSubject(saved.groupSubjectId, byId) : null;
      await saveSubjectLink(userId, { groupId: group.id, localSubjectId: localId, groupSubjectId: target });
      // la materia di prima perde le tue righe, se nessun'altra tua materia ci va
      const stillUsed = links.some(
        (l) => l.localSubjectId !== localId && l.groupSubjectId && resolveGroupSubject(l.groupSubjectId, byId) === before
      );
      await updateSubjectPending(userId, (p) => ({
        ...p,
        revoke: before && before !== target && !stillUsed ? [...p.revoke, { groupId: group.id, subjectId: before }] : p.revoke,
        backfillAt: target ? Date.now() : p.backfillAt,
      }));
      setDrafts(({ [localId]: _done, ...rest }) => rest);
      setVersion((v) => v + 1);
      requestSync(0);
      onChanged();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function createAndLink() {
    if (!creating) return;
    setBusy(true);
    setError(null);
    try {
      const id = await createGroupSubject(group.id, creating.name.trim());
      setCreating(null);
      setBusy(false);
      // creata apposta: la scelta è esplicita, si abbina subito
      await confirm(creating.localId, id);
    } catch (e) {
      setError(messageOf(e));
      setBusy(false);
    }
  }

  return (
    <section className="gsl" aria-labelledby="gsl-title">
      <div className="gsl-head">
        <h3 id="gsl-title">Le tue materie in questo gruppo</h3>
        <span className="grp-muted">
          Abbiniamo le tue materie a quelle del gruppo, così "Analisi 2" e "analisi" finiscono insieme. Controlla le
          proposte: entrano nel report solo le materie che confermi.
        </span>
      </div>

      {!settings.groupsReportSubjects && (
        <div className="gsl-off">
          <span>
            Per ora il tuo tempo conta tutto in "Altre materie": per mandare le materie confermate accendi "Includi le mie
            materie nei report dei gruppi".
          </span>
          <button type="button" className="grp-btn grp-btn--ghost grp-btn--sm" onClick={onOpenSharing}>
            Cosa vedono gli altri
          </button>
        </div>
      )}

      {shown.length === 0 && <span className="grp-muted">Non hai ancora materie nel widget Studio.</span>}

      {shown.map((local) => {
        const saved = linkOf(local.id);
        const savedTarget = saved ? (saved.groupSubjectId ? resolveGroupSubject(saved.groupSubjectId, byId) ?? "" : "") : null;
        const proposal = savedTarget === null ? proposeGroupSubject(local.name, active)?.id ?? "" : null;
        const value = drafts[local.id] ?? savedTarget ?? proposal ?? "";
        const changed = savedTarget === null ? value !== "" || drafts[local.id] !== undefined : value !== savedTarget;
        const isCreating = creating?.localId === local.id;
        const selectId = `gsl-select-${local.id}`;
        return (
          <div key={local.id} className="gsl-row">
            <span className="gsl-mine" title={local.name}>
              {local.name}
            </span>
            <ArrowIcon />
            {isCreating ? (
              <span className="gsl-create">
                <label className="gsl-sr" htmlFor={selectId}>
                  Nome della nuova materia del gruppo per {local.name}
                </label>
                <input
                  id={selectId}
                  className="grp-field gsl-input"
                  value={creating.name}
                  maxLength={GROUP_SUBJECT_NAME_MAX}
                  autoFocus
                  onChange={(e) => setCreating({ localId: local.id, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && creating.name.trim()) void createAndLink();
                    if (e.key === "Escape") setCreating(null);
                  }}
                />
                <button type="button" className="grp-btn grp-btn--sm" disabled={busy || !creating.name.trim()} onClick={() => void createAndLink()}>
                  Crea e abbina
                </button>
                <button type="button" className="grp-btn grp-btn--plain grp-btn--sm" onClick={() => setCreating(null)}>
                  Annulla
                </button>
              </span>
            ) : (
              <>
                <label className="gsl-select-wrap">
                  <span className="gsl-sr">Materia del gruppo per {local.name}</span>
                  <select
                    className="grp-field gsl-select"
                    value={value}
                    disabled={busy}
                    onChange={(e) => {
                      if (e.target.value === NEW) setCreating({ localId: local.id, name: suggestedGroupSubjectName(local.name) });
                      else setDrafts((d) => ({ ...d, [local.id]: e.target.value }));
                    }}
                  >
                    <option value="">Non condividere</option>
                    {active.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                    <option value={NEW}>Nuova materia del gruppo…</option>
                  </select>
                </label>
                {changed ? (
                  <button type="button" className="grp-btn grp-btn--sm" disabled={busy} onClick={() => void confirm(local.id, value || null)}>
                    Conferma
                  </button>
                ) : (
                  savedTarget && (
                    <span className="grp-ok gsl-done">
                      <CheckIcon />
                      Confermata
                    </span>
                  )
                )}
              </>
            )}
          </div>
        );
      })}

      {error && (
        <p className="grp-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export default GroupSubjectLinks;
