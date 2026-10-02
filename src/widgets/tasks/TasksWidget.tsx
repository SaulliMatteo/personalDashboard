import WidgetFrame from "../../core/widgets/WidgetFrame";
import "./tasks.css";

function TasksWidget() {
  return (
    <WidgetFrame>
      <article className="widget">
        <div className="widget-header">
          <h2>Tasks</h2>
        </div>

        <div className="widget-value">12</div>
        <p className="widget-description">tasks remaining</p>
      </article>
    </WidgetFrame>
  );
}

export default TasksWidget;
