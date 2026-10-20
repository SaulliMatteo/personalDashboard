import type { SizeKey } from "../../../core/widgets/sizes";
import { useSettings } from "../../../core/settings/SettingsContext";
import { useCompanion } from "../CompanionContext";
import CompanionFace from "../components/CompanionFace";
import { BEHAVIOR_LABELS } from "../engine/brain";
import "./companionCards.css";

/**
 * Card del Companion, una per tema (temi-dashboard/docs/design/temi/*.html).
 * 1×1: solo la faccia. 2×1: faccia nel suo riquadro, nome e stato a destra.
 * 2×2: faccia, fumetto, nome e stato.
 */
interface CardProps {
  size: SizeKey;
}

function useCompanionCard() {
  const { snapshot } = useCompanion();
  const { settings } = useSettings();
  return {
    name: settings.companionName || "Companion",
    status: BEHAVIOR_LABELS[snapshot.behavior],
    bubble: snapshot.bubble,
  };
}

/** Il fumetto del momento: compare, resta per la sua durata e svanisce. */
function Bubble({ className }: { className: string }) {
  const { bubble } = useCompanionCard();
  if (!bubble) return null;
  return (
    <span key={bubble.id} className={`cc-bubble ${className}`} style={{ animationDuration: `${bubble.durationMs}ms` }} role="status">
      {bubble.text}
    </span>
  );
}

function Face({ className = "" }: { className?: string }) {
  return <CompanionFace className={`cc-face ${className}`} showBubble={false} />;
}

/** Notte: faccia in un pannello interno con un alone tenue, nome e stato sotto. */
export function CompanionCardNotte({ size }: CardProps) {
  const { name, status } = useCompanionCard();
  if (size === "S") {
    return (
      <article className="widget cn cn--S">
        <Face />
      </article>
    );
  }
  return (
    <article className={`widget cn cn--${size}`}>
      <div className="cn-panel">
        <span className="cn-halo" aria-hidden="true" />
        <Face />
        {size === "M" && <Bubble className="cn-bubble" />}
      </div>
      <footer className="cn-foot">
        <div className="cn-name">{name}</div>
        <div className="cn-status">{status}</div>
      </footer>
    </article>
  );
}

/** Opaco: faccia in inchiostro direttamente sul blu polvere, nome grande in alto. */
export function CompanionCardOpaco({ size }: CardProps) {
  const { name, status } = useCompanionCard();
  if (size === "S") {
    return (
      <article className="widget co co--S">
        <Face />
      </article>
    );
  }
  if (size === "W") {
    return (
      <article className="widget co co--W">
        <Face className="co-face-box" />
        <div className="co-text">
          <h2>{name}</h2>
          <span className="co-status">{status}</span>
        </div>
      </article>
    );
  }
  return (
    <article className="widget co co--M">
      <header className="co-head">
        <h2>{name}</h2>
        <span className="co-status">{status}</span>
      </header>
      <Face />
      <div className="co-bubble-slot">
        <Bubble className="co-bubble" />
      </div>
    </article>
  );
}

/** Quaderno: la card è un post-it ruotato; il fumetto è scritto a mano. */
export function CompanionCardQuaderno({ size }: CardProps) {
  const { name, status } = useCompanionCard();
  if (size === "S") {
    return (
      <article className="widget cq cq--S">
        <Face />
      </article>
    );
  }
  if (size === "W") {
    return (
      <article className="widget cq cq--W">
        <Face className="cq-face-box" />
        <div className="cq-text">
          <span className="cq-name">{name}</span>
          <span className="cq-status">{status}</span>
        </div>
      </article>
    );
  }
  return (
    <article className="widget cq cq--M">
      <div className="cq-bubble-slot">
        <Bubble className="cq-bubble" />
      </div>
      <Face />
      <footer className="cq-foot">
        <span className="cq-name">{name}</span>
        <span className="cq-status">{status}</span>
      </footer>
    </article>
  );
}

/** Fosforo: faccia a punti dentro una "lente" sul display. */
export function CompanionCardFosforo({ size }: CardProps) {
  const { name, status } = useCompanionCard();
  if (size === "S") {
    return (
      <article className="widget cf cf--S">
        <Face />
      </article>
    );
  }
  if (size === "W") {
    return (
      <article className="widget cf cf--W">
        <div className="cf-screen">
          <Face />
        </div>
        <div className="cf-text">
          <span>{name}</span>
          <span className="cf-status">{status}</span>
        </div>
      </article>
    );
  }
  return (
    <article className="widget cf cf--M">
      <header className="cf-head">
        <span>{name}</span>
        <span className="cf-status">{status}</span>
      </header>
      <div className="cf-screen">
        <span className="cf-lens-ring" aria-hidden="true" />
        <span className="cf-lens" aria-hidden="true" />
        <Face />
        <Bubble className="cf-bubble" />
      </div>
    </article>
  );
}
