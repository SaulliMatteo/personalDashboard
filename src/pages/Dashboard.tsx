import { useState, useEffect } from "react";
import GridLayout, { useContainerWidth } from "react-grid-layout";
import Sidebar from "../components/sideBar/Sidebar";
import WeatherWidget from "../components/widgets/WeatherWidget";
import TasksWidget from "../components/widgets/TasksWidget";
import CalendarWidget from "../components/widgets/CalendarWidget";
import NotesWidget from "../components/widgets/NotesWidget";
import "react-grid-layout/css/styles.css";
import {
  saveLayout,
  loadLayout,
  type LayoutItem,
} from "../database/layoutRepository";


const WIDGETS: Record<string, () => React.ReactElement> = {
  weather: () => <WeatherWidget />,
  tasks: () => <TasksWidget />,
  calendar: () => <CalendarWidget />,
  notes: () => <NotesWidget />,
};

const DefaultLayout: LayoutItem[] = [
  { i: "weather", x: 0, y: 0, w: 4, h: 4 },
  { i: "tasks", x: 4, y: 0, w: 4, h: 4 },
  { i: "calendar", x: 4, y: 0, w: 4, h: 2 },
  { i: "notes", x: 0, y: 2, w: 4, h: 4 },
]

function Dashboard() {
  const { width, containerRef, mounted } = useContainerWidth();

  const [layout, setLayout] = useState<LayoutItem[]>(DefaultLayout);

  const [dragGhost, setDragGhost] = useState<LayoutItem | null>(null);

  useEffect(() => {
    async function initializeLayout() {
      try {
        const savedLayout = await loadLayout();

        if (savedLayout.length > 0) {
          setLayout(savedLayout);
        }
      } catch (error) {
        console.error(
          "Errore nel caricamento del layout:",
          error
        );
      }
    }

    initializeLayout();
  }, []);

  // firma reale: (layout, oldItem, newItem, placeholder, event, element)
  const captureGhost = (
  _layout: readonly LayoutItem[],
  _oldItem: LayoutItem | null,
  newItem: LayoutItem | null,
  placeholder: LayoutItem | null
  ) => {
    // placeholder è la posizione REALE di atterraggio (post-compattazione/collisioni).
    // È nullo solo nel primissimo istante di onDragStart, quindi in quel caso
    // usiamo newItem come fallback iniziale.
    const target = placeholder ?? newItem;
    if (!target) return;
    setDragGhost({
      i: target.i,
      x: target.x,
      y: target.y,
      w: target.w,
      h: target.h,
    });
  };

  const cols = 12;
  const rowHeight = 40;
  const marginX = 10;
  const marginY = 10;

  const ghostStyle = (() => {
    if (!dragGhost || !width) return null;
    const colWidth = (width - marginX * (cols + 1)) / cols;
    return {
      left: marginX + dragGhost.x * (colWidth + marginX),
      top: marginY + dragGhost.y * (rowHeight + marginY),
      width: dragGhost.w * colWidth + (dragGhost.w - 1) * marginX,
      height: dragGhost.h * rowHeight + (dragGhost.h - 1) * marginY,
    };
  })();

  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        <header className="dashboard-header">
          <div>
            <h1>Dashboard</h1>
            <p>Welcome back.</p>
          </div>
        </header>

        <div ref={containerRef} className="grid-container" style={{ position: "relative" }}>
          {mounted && (
            <GridLayout
              className="widget-grid"
              layout={layout}
              gridConfig={{ cols, rowHeight, margin: [marginX, marginY] }}
              width={width}
              onDragStart={captureGhost}
              onDrag={captureGhost}
              onDragStop={async (newLayout) => {
                const newLayoutItems = newLayout as LayoutItem[];
                setLayout(newLayoutItems);
                setDragGhost(null);

                await saveLayout(newLayoutItems);
              }}
              onLayoutChange={(newLayout) => {
                setLayout(newLayout as LayoutItem[]);
              }}
            >
              <div key="weather"><WeatherWidget /></div>
              <div key="tasks"><TasksWidget /></div>
              <div key="calendar"><CalendarWidget /></div>
              <div key="notes"><NotesWidget /></div>
            </GridLayout>
          )}

          {dragGhost && ghostStyle && (
            <div className="widget-ghost" style={ghostStyle}>
              <div className="widget">{WIDGETS[dragGhost.i]?.()}</div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default Dashboard;