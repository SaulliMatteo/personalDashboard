import BorderGlow from "../import/BorderGlow";

function CalendarWidget() {
  return (
    <BorderGlow
                edgeSensitivity={24}
                glowColor="40 80 80"
                backgroundColor="#000"
                borderRadius={28}
                glowRadius={33}
                glowIntensity={0.7}
                coneSpread={25}
                animated={true}
                colors={['#c084fc', '#f472b6', '#38bdf8']}
              >
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

              </BorderGlow>
  );
}

export default CalendarWidget;