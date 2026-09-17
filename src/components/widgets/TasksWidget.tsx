import BorderGlow from "../import/BorderGlow";


function TasksWidget() {

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
      <article className="widget">
        <div className="widget-header">
          <h2>Tasks</h2>
        </div>

        <div className="widget-value">
          12
        </div>

        <p className="widget-description">
          tasks remaining
        </p>
      </article>

    </BorderGlow>
  );
}

export default TasksWidget;