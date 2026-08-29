import Sidebar from "../components/sideBar/sideBar";

import WeatherWidget from "../components/widgets/WeatherWidget";
import TasksWidget from "../components/widgets/TasksWidget";
import CalendarWidget from "../components/widgets/CalendarWidget";
import NotesWidget from "../components/widgets/NotesWidget";

function Dashboard() {
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

        <section className="widget-grid">
          <WeatherWidget />
          <TasksWidget />
          <CalendarWidget />
          <NotesWidget />
        </section>
      </main>
    </div>
  );
}

export default Dashboard;