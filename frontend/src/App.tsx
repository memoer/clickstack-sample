import { useTaskManager } from "./hooks/useTaskManager";
import { TaskManagerView } from "./views/TaskManagerView";

function App() {
  const taskManager = useTaskManager();

  return <TaskManagerView {...taskManager} />;
}

export default App;
