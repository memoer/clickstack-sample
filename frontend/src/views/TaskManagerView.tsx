import { DB_LABELS } from "../constants";
import { DatabaseType } from "../types";
import { Task } from "../hooks/useTaskManager";

interface TaskManagerViewProps {
  database: DatabaseType;
  tasks: Task[];
  loading: boolean;
  error: string | null;
  newTask: { title: string; description: string };
  setNewTask: React.Dispatch<
    React.SetStateAction<{ title: string; description: string }>
  >;
  handleRefreshTask: () => Promise<void>;
  handleCreatingTask: (e: React.FormEvent) => Promise<void>;
  handleToggleTask: (task: Task) => Promise<void>;
  handleDeletingTask: (id: string) => Promise<void>;
  handleSlowOperation: () => Promise<void>;
  handleServerError: () => Promise<void>;
  handleCheckingHealth: () => Promise<void>;
  handleFrontError: () => void;
  handleDatabaseChange: (db: DatabaseType) => void;
}

export function TaskManagerView({
  database,
  tasks,
  loading,
  error,
  newTask,
  setNewTask,
  handleRefreshTask,
  handleCreatingTask,
  handleToggleTask,
  handleDeletingTask,
  handleSlowOperation,
  handleServerError,
  handleCheckingHealth,
  handleFrontError,
  handleDatabaseChange,
}: TaskManagerViewProps) {
  return (
    <div className="container">
      <header>
        <h1>🔭 ClickStack Demo</h1>
        <p>NestJS + React + OpenTelemetry → ClickStack</p>
      </header>

      <div className="database-tabs">
        {(Object.keys(DB_LABELS) as DatabaseType[]).map(db => (
          <button
            key={db}
            className={`db-tab ${database === db ? "active" : ""}`}
            onClick={() => handleDatabaseChange(db)}
          >
            {DB_LABELS[db]}
          </button>
        ))}
      </div>

      <div className="grid">
        <section className="card">
          <h2>
            📋 Task Manager{" "}
            <span className="db-badge">{DB_LABELS[database]}</span>
          </h2>

          <form onSubmit={handleCreatingTask} className="form">
            <input
              type="text"
              placeholder="Task title"
              value={newTask.title}
              onChange={e =>
                setNewTask(prev => ({ ...prev, title: e.target.value }))
              }
            />
            <input
              type="text"
              placeholder="Description"
              value={newTask.description}
              onChange={e =>
                setNewTask(prev => ({ ...prev, description: e.target.value }))
              }
            />
            <button type="submit">Add Task</button>
          </form>

          {loading && <p className="loading">Loading...</p>}
          {error && <p className="error">Error: {error}</p>}

          <ul className="task-list">
            {tasks.map(task => (
              <li key={task.id} className={task.completed ? "completed" : ""}>
                <label>
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={() => handleToggleTask(task)}
                  />
                  <span className="task-title">{task.title}</span>
                </label>
                <span className="task-desc">{task.description}</span>
                <button
                  className="delete-btn"
                  onClick={() => handleDeletingTask(task.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2>🧪 Test Observability</h2>
          <p>Generate traces and logs for ClickStack</p>

          <div className="button-group">
            <button onClick={handleRefreshTask}>🔄 Refresh Tasks</button>
            <button onClick={handleCheckingHealth}>🏥 Health Check</button>
            <button onClick={handleSlowOperation}>🐢 Slow Operation</button>
            <button onClick={handleServerError} className="danger">
              💥 Backend Error
            </button>
            <button onClick={handleFrontError} className="danger">
              🖥️ Frontend Error
            </button>
          </div>

          <div className="info-box">
            <h3>ClickStack</h3>
            <ul>
              <li>Search → View logs</li>
              <li>Traces → See distributed traces</li>
              <li>Dashboards → Create visualizations</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
