import { useState, useEffect } from "react";
import BorderGlow from "../import/BorderGlow";

function NotesWidget() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <BorderGlow
      edgeSensitivity={24}
      glowColor="40 80 80"
      backgroundColor="#000"
      borderRadius={14}
      glowRadius={33}
      glowIntensity={0.7}
      coneSpread={25}
      animated={true}
      colors={['#c084fc', '#f472b6', '#38bdf8']}
    >
      <article className={`widget ${mounted ? "enter" : ""}`}>
        <div className="widget-header">
          <h2>Notes</h2>
        </div>
        <p className="note">Remember to study React and TypeScript.</p>
        <p className="note">Implement SQLite after the UI.</p>
      </article>
    </BorderGlow>
  );
}

export default NotesWidget;