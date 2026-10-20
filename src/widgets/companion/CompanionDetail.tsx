import { useEffect } from "react";
import { MdPlayArrow, MdChatBubbleOutline, MdFavoriteBorder } from "react-icons/md";
import { useNav } from "../../core/nav/NavContext";
import { useSettings } from "../../core/settings/SettingsContext";
import { useActivityStatus } from "../../core/activity/activityBus";
import SettingsSection from "../../core/settings/components/SettingsSection";
import BackButton from "../../ui/BackButton";
import { useCompanion } from "./CompanionContext";
import CompanionFace from "./components/CompanionFace";
import { BEHAVIOR_LABELS } from "./engine/brain";
import { ANIMATIONS, ANIMATION_CATEGORIES } from "./engine/animations";
import { PERSONALITIES, PERSONALITY_IDS } from "./engine/personalities";
import type { AppCategory } from "./engine/appCategory";
import "./CompanionDetail.css";

const CATEGORY_LABELS: Record<AppCategory, string> = {
  video: "video",
  music: "musica",
  coding: "lavoro / codice",
  office: "documenti",
  chat: "chat",
  design: "grafica",
  game: "gioco",
  browser: "navigazione",
  other: "altro",
};

function formatIdle(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const m = Math.floor(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** Pagina del Companion: anteprima dal vivo, personalità, animazioni on/off e impostazioni. */
function CompanionDetail() {
  const { goToDashboard } = useNav();
  const { settings, updateSetting } = useSettings();
  const activity = useActivityStatus();
  const { snapshot, foreground, idleSeconds, systemSupported, disabled, poke, chatter, previewAnimation, setAnimationEnabled, retain } = useCompanion();

  // Tiene vivo il Companion anche se il widget non è in dashboard.
  useEffect(() => retain(), [retain]);

  const name = settings.companionName || "Companion";

  let foregroundText: string;
  if (!settings.companionWatchForegroundApp) foregroundText = "Disattivato";
  else if (!systemSupported) foregroundText = "Disponibile solo nell'app per Windows";
  else if (!foreground) foregroundText = "La dashboard (o non riconosciuta)";
  else foregroundText = `${foreground.label} · ${CATEGORY_LABELS[foreground.category]}`;

  const studyText = activity.studying ? "In corso" : activity.onBreak ? "In pausa (pomodoro)" : activity.studyPaused ? "Timer fermo" : "—";

  return (
    <div className="companion-detail">
      <header className="dashboard-header companion-detail-header">
        <div>
          <h1>{name}</h1>
          <p>Il tuo compagno di scrivania: personalità, animazioni e comportamento.</p>
        </div>
        <BackButton onClick={goToDashboard} />
      </header>

      <div className="companion-detail-grid">
        <aside className="companion-detail-side">
          <div className="companion-stage">
            <CompanionFace bubbleSize="large" maxPointSize={12} />
          </div>
          <div className="companion-stage-actions">
            <button type="button" className="companion-btn" onClick={poke}>
              <MdFavoriteBorder /> Accarezza
            </button>
            <button type="button" className="companion-btn" onClick={chatter} disabled={!settings.companionBubbles}>
              <MdChatBubbleOutline /> Dì qualcosa
            </button>
          </div>

          <section className="companion-card">
            <h2 className="companion-card-title">Cosa vede adesso</h2>
            <dl className="companion-status">
              <dt>Stato</dt>
              <dd>{BEHAVIOR_LABELS[snapshot.behavior]}</dd>
              <dt>Studio</dt>
              <dd>{studyText}</dd>
              <dt>Video nell'app</dt>
              <dd>{activity.watchingVideo ? "In riproduzione" : "—"}</dd>
              <dt>App in primo piano</dt>
              <dd>{foregroundText}</dd>
              <dt>Inattivo da</dt>
              <dd>{formatIdle(idleSeconds)}</dd>
            </dl>
            <p className="companion-note">
              Tutto viene elaborato sul PC e dimenticato subito: nessun titolo di finestra viene salvato o inviato.
            </p>
          </section>
        </aside>

        <div className="companion-detail-main">
          <section className="companion-card">
            <h2 className="companion-card-title">Personalità</h2>
            <div className="companion-personalities">
              {PERSONALITY_IDS.map((id) => {
                const p = PERSONALITIES[id];
                const selected = settings.companionPersonality === id;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`companion-personality${selected ? " is-selected" : ""}`}
                    aria-pressed={selected}
                    onClick={() => updateSetting("companionPersonality", id)}
                  >
                    <span className="companion-personality-name">{p.label}</span>
                    <span className="companion-personality-desc">{p.description}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="companion-card">
            <h2 className="companion-card-title">Animazioni</h2>
            <p className="companion-note">Spegni quelle che non ti piacciono. "Prova" la mostra subito, anche se è spenta.</p>
            {ANIMATION_CATEGORIES.map((cat) => (
              <div key={cat.id} className="companion-anim-group">
                <h3 className="companion-anim-group-title">{cat.label}</h3>
                <p className="companion-anim-group-desc">{cat.description}</p>
                <ul className="companion-anim-list">
                  {ANIMATIONS.filter((a) => a.category === cat.id).map((anim) => {
                    const enabled = !disabled.has(anim.id);
                    const dimmed = cat.id === "emotes" && !settings.companionRandomEmotes;
                    return (
                      <li key={anim.id} className={`companion-anim${enabled ? "" : " is-off"}${dimmed ? " is-dimmed" : ""}`}>
                        <label className="companion-anim-toggle">
                          <input type="checkbox" checked={enabled} onChange={(e) => setAnimationEnabled(anim.id, e.target.checked)} />
                          <span className="companion-anim-text">
                            <span className="companion-anim-label">{anim.label}</span>
                            <span className="companion-anim-desc">{anim.description}</span>
                          </span>
                        </label>
                        <button type="button" className="companion-anim-try" onClick={() => previewAnimation(anim.id)} aria-label={`Prova ${anim.label}`}>
                          <MdPlayArrow /> Prova
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>

          <section className="companion-card">
            <h2 className="companion-card-title">Impostazioni</h2>
            <SettingsSection group="companion" className="companion-settings" />
          </section>
        </div>
      </div>
    </div>
  );
}

export default CompanionDetail;
