function CalendarWidget() {
  return (
    <article className="widget">
      <div className="widget-header">
        <h2>Calendar</h2>
      </div>

      <div className="calendar-event">
        <strong>10:00</strong>
        <span>Study React</span>
      </div>

      <div className="calendar-event">
        <strong>15:00</strong>
        <span>Work on Dashboard</span>
      </div>
    </article>
  );
}

export default CalendarWidget;