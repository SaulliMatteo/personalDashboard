import { createElement, useCallback, useEffect, useState } from "react";
import { MdPlayArrow, MdStop, MdChatBubbleOutline, MdFavoriteBorder } from "react-icons/md";
import { useNav } from "../../core/nav/useNav";
import { useSettings } from "../../core/settings/useSettings";
import { useActivityStatus } from "../../core/activity/activityBus";
import SettingsSection from "../../core/settings/components/SettingsSection";
import BackButton from "../../ui/BackButton";
import { useCompanion } from "./useCompanion";
import { useThemeVariant } from "../../core/theme/variants";
import { COMPANION_CARDS } from "./card/cards";
import { ANIMATIONS, ANIMATION_CATEGORIES, ANIMATION_GALLERY, type AnimationCategory, type GalleryItem } from "./engine/animations";
import { PERSONALITIES, PERSONALITY_IDS } from "./engine/personalities";
import { APP_CATEGORIES, type AppCategory } from "./engine/appCategory";
import "./CompanionDetail.css";

const CATEGORY_LABELS: Record<AppCategory, string> = {
  coding: "programmazione",
  office: "documenti",
  design: "grafica",
  game: "gioco",
  chat: "chat",
  video: "video",
  music: "musica",
  browser: "navigazione",
  other: "altro",
};

type Tab = "animations" | "personality" | "apps" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "animations", label: "Animazioni" },
  { id: "personality", label: "Personalità" },
  { id: "apps", label: "App viste" },
  { id: "settings", label: "Impostazioni" },
];

/** Quanto resta ogni posa quando la galleria va da sola. */
const STEP_MS = 3500;

function formatIdle(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const m = Math.floor(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

function galleryItems(cat: AnimationCategory): GalleryItem[] {
  return (ANIMATION_GALLERY[cat] ?? []).flatMap((g) => g.items);
}

/** Pagina del Companion: anteprima dal vivo, galleria delle pose, animazioni on/off, personalità e impostazioni. */
function CompanionDetail() {
  const { goToDashboard } = useNav();
  const { settings, updateSetting } = useSettings();
  const activity = useActivityStatus();
  const Card = useThemeVariant(COMPANION_CARDS);
  const {
    snapshot,
    foreground,
    idleSeconds,
    systemSupported,
    seenApps,
    appChoices,
    setAppCategory,
    disabled,
    poke,
    chatter,
    previewAnimation,
    previewPose,
    setAnimationEnabled,
    retain,
  } = useCompanion();

  const [tab, setTab] = useState<Tab>("animations");
  const [category, setCategory] = useState<AnimationCategory>("study");
  // Posa della galleria in anteprima; `auto` = la galleria va avanti da sola.
  const [current, setCurrent] = useState<{ cat: AnimationCategory; index: number; auto: boolean } | null>(null);

  // Tiene vivo il Companion anche se il widget non è in dashboard.
  useEffect(() => retain(), [retain]);

  const runItem = useCallback(
    (item: GalleryItem) => {
      if (item.pose) previewPose(item.pose, STEP_MS + 300);
      else if (item.animation) previewAnimation(item.animation);
    },
    [previewPose, previewAnimation]
  );

  // Finita una posa: la successiva se la galleria va da sola, altrimenti si spegne l'evidenziazione.
  useEffect(() => {
    if (!current) return;
    const id = window.setTimeout(() => {
      const items = galleryItems(current.cat);
      const next = current.index + 1;
      if (!current.auto || next >= items.length) {
        setCurrent(null);
        return;
      }
      runItem(items[next]);
      setCurrent({ ...current, index: next });
    }, STEP_MS);
    return () => window.clearTimeout(id);
  }, [current, runItem]);

  const tryItem = (cat: AnimationCategory, index: number) => {
    runItem(galleryItems(cat)[index]);
    setCurrent({ cat, index, auto: false });
  };

  const playAll = (cat: AnimationCategory) => {
    if (current?.auto) {
      setCurrent(null);
      return;
    }
    runItem(galleryItems(cat)[0]);
    setCurrent({ cat, index: 0, auto: true });
  };

  const chooseCategory = (cat: AnimationCategory) => {
    setCategory(cat);
    setCurrent(null);
  };

  const name = settings.companionName || "Pixy";

  let foregroundText: string;
  if (!settings.companionWatchForegroundApp) foregroundText = "Disattivato";
  else if (!systemSupported) foregroundText = "Disponibile solo nell'app per Windows";
  else if (!foreground) foregroundText = "La dashboard (o non riconosciuta)";
  else foregroundText = `${foreground.label} · ${CATEGORY_LABELS[foreground.category]}`;

  const studyText = activity.studying ? "In corso" : activity.onBreak ? "In pausa (pomodoro)" : activity.studyPaused ? "Timer fermo" : "—";

  const cat = ANIMATION_CATEGORIES.find((c) => c.id === category) ?? ANIMATION_CATEGORIES[0];
  const catAnims = ANIMATIONS.filter((a) => a.category === cat.id);
  const catAllOn = catAnims.every((a) => !disabled.has(a.id));
  const gallery = ANIMATION_GALLERY[cat.id] ?? [];
  const currentItems = current ? galleryItems(current.cat) : [];
  const currentItem = current ? currentItems[current.index] : null;

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
          {/* La card 2×2 del tema, con la faccia dal vivo. card-postit: in Quaderno è un post-it. */}
          <div className="companion-stage card-postit">{createElement(Card, { size: "M" })}</div>
          <p className="companion-now" aria-live="polite">
            {currentItem ? (
              <>
                <MdPlayArrow /> {currentItem.label}
                {current?.auto && (
                  <span className="companion-now-count">
                    {current.index + 1} di {currentItems.length}
                  </span>
                )}
              </>
            ) : (
              snapshot.status
            )}
          </p>
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
              <dd>{snapshot.status}</dd>
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
          <div className="companion-tabs" role="tablist" aria-label={`Sezioni di ${name}`}>
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`companion-tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls="companion-tabpanel"
                className={`companion-tab${tab === t.id ? " is-active" : ""}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div id="companion-tabpanel" role="tabpanel" aria-labelledby={`companion-tab-${tab}`} className="companion-detail-panel">
            {tab === "animations" && (
              <section className="companion-card">
                <p className="companion-note companion-note-top">
                  Scegli un gruppo, tocca una posa per vederla sulla faccia qui accanto o premi "Guarda tutte". Le pose cambiano con la
                  personalità ({PERSONALITIES[settings.companionPersonality].label}).
                </p>

                <div className="companion-cats" aria-label="Gruppi di animazioni">
                  {ANIMATION_CATEGORIES.map((c) => {
                    const anims = ANIMATIONS.filter((a) => a.category === c.id);
                    const on = anims.filter((a) => !disabled.has(a.id)).length;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={c.id === cat.id}
                        className={`companion-cat${c.id === cat.id ? " is-active" : ""}`}
                        onClick={() => chooseCategory(c.id)}
                      >
                        {c.label}
                        <span className="companion-cat-count">
                          {on}/{anims.length}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="companion-group-head">
                  <div>
                    <h3 className="companion-group-title">{cat.label}</h3>
                    <p className="companion-group-desc">{cat.description}</p>
                  </div>
                  <div className="companion-group-actions">
                    {gallery.length > 0 && (
                      <button type="button" className="companion-small-btn is-primary" onClick={() => playAll(cat.id)}>
                        {current?.auto ? (
                          <>
                            <MdStop /> Ferma
                          </>
                        ) : (
                          <>
                            <MdPlayArrow /> Guarda tutte
                          </>
                        )}
                      </button>
                    )}
                    <button type="button" className="companion-small-btn" onClick={() => setAnimationEnabled(catAnims.map((a) => a.id), !catAllOn)}>
                      {catAllOn ? "Spegni tutte" : "Accendi tutte"}
                    </button>
                  </div>
                </div>

                {cat.id === "emotes" && !settings.companionRandomEmotes && (
                  <p className="companion-note">Le emozioni casuali sono spente nelle Impostazioni: qui puoi comunque provarle.</p>
                )}

                {gallery.length > 0 && (
                  <div className="companion-gallery-wrap">
                    {(() => {
                      let offset = 0;
                      return gallery.map((group, gi) => {
                        const start = offset;
                        offset += group.items.length;
                        return (
                          <div key={gi} className="companion-gallery-group">
                            {group.label && <h4 className="companion-sub-title">{group.label}</h4>}
                            <div className="companion-gallery">
                              {group.items.map((item, i) => {
                                const index = start + i;
                                const playing = current?.cat === cat.id && current.index === index;
                                return (
                                  <button
                                    key={item.label}
                                    type="button"
                                    className={`companion-pose${playing ? " is-playing" : ""}`}
                                    onClick={() => tryItem(cat.id, index)}
                                  >
                                    <MdPlayArrow className="companion-pose-icon" aria-hidden />
                                    {item.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}

                <h4 className="companion-sub-title">Quando farle</h4>
                <ul className="companion-anim-list">
                  {catAnims.map((anim) => {
                    const enabled = !disabled.has(anim.id);
                    const dimmed = cat.id === "emotes" && !settings.companionRandomEmotes;
                    return (
                      <li key={anim.id} className={`companion-anim${enabled ? "" : " is-off"}${dimmed ? " is-dimmed" : ""}`}>
                        <label className="companion-anim-toggle">
                          <input
                            type="checkbox"
                            role="switch"
                            className="companion-switch"
                            checked={enabled}
                            onChange={(e) => setAnimationEnabled(anim.id, e.target.checked)}
                          />
                          <span className="companion-anim-text">
                            <span className="companion-anim-label">{anim.label}</span>
                            <span className="companion-anim-desc">{anim.description}</span>
                          </span>
                        </label>
                        <button
                          type="button"
                          className="companion-anim-try"
                          onClick={() => {
                            setCurrent(null);
                            previewAnimation(anim.id);
                          }}
                          aria-label={`Prova ${anim.label}`}
                          title="Prova"
                        >
                          <MdPlayArrow />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {tab === "personality" && (
              <section className="companion-card">
                <p className="companion-note companion-note-top">
                  Cambia il modo in cui {name} si muove, parla e reagisce. Dopo averla scelta, riprova le pose in "Animazioni".
                </p>
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
            )}

            {tab === "apps" && (
              <section className="companion-card">
                <p className="companion-note companion-note-top">
                  Le ultime app che hai usato e come {name} le ha capite. Se sbaglia, scegli tu la categoria: vale da subito e resta salvata.
                </p>
                {!settings.companionWatchForegroundApp || !systemSupported ? (
                  <p className="companion-note">{foregroundText}.</p>
                ) : seenApps.length === 0 ? (
                  <p className="companion-note">Ancora nessuna: apri un'altra app e torna qui.</p>
                ) : (
                  <ul className="companion-anim-list companion-app-list">
                    {seenApps.map((app) => {
                      const chosen = appChoices.get(app.processKey);
                      return (
                        <li key={app.processKey} className="companion-anim companion-app">
                          <span className="companion-anim-text">
                            <span className="companion-anim-label">{app.label}</span>
                            <span className="companion-anim-desc">
                              {app.processKey}.exe · {chosen ? `scelta tua (da solo: ${CATEGORY_LABELS[app.autoCategory]})` : "riconosciuta da sola"}
                            </span>
                          </span>
                          <select
                            className="companion-app-select"
                            aria-label={`Categoria di ${app.label}`}
                            value={chosen ?? ""}
                            onChange={(e) => setAppCategory(app.processKey, (e.target.value || null) as AppCategory | null)}
                          >
                            <option value="">Automatica: {CATEGORY_LABELS[app.autoCategory]}</option>
                            {APP_CATEGORIES.map((c) => (
                              <option key={c} value={c}>
                                {CATEGORY_LABELS[c]}
                              </option>
                            ))}
                          </select>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            )}

            {tab === "settings" && (
              <section className="companion-card">
                <SettingsSection group="companion" className="companion-settings" />
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CompanionDetail;
