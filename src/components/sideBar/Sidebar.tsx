function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        Personal Dashboard
      </div>

      <nav className="sidebar-nav">
        <button className="nav-item active">
          Dashboard
        </button>

        <button className="nav-item">
          Tasks
        </button>

        <button className="nav-item">
          Projects
        </button>

        <button className="nav-item">
          Notes
        </button>
      </nav>

      <div className="sidebar-bottom">
        <button className="nav-item">
          Settings
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;