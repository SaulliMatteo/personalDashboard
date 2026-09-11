function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        Personal Dashboard
      </div>

      <nav className="sidebar-nav">
        <button className="nav-item active">
          <span>⌂</span>
          Dashboard
        </button>

        <button className="nav-item">
          <span>✓</span>
          Tasks
        </button>

        <button className="nav-item">
          <span>▣</span>
          Projects
        </button>

        <button className="nav-item">
          <span>□</span>
          Notes
        </button>
      </nav>

      <div className="sidebar-bottom">
        <button className="nav-item">
          <span>⚙</span>
          Settings
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;