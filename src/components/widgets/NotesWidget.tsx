import { useState, useEffect } from "react";

function NotesWidget() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <article className={`widget ${mounted ? "enter" : ""}`}>
      <div className="widget-header">
        <h2>Notes</h2>
      </div>
      <p className="note">Remember to study React and TypeScript.</p>
      <p className="note">Implement SQLite after the UI.</p>
    </article>
  );
}

export default NotesWidget;