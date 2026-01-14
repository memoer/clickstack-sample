import { useState, useEffect, useCallback } from "react";
import { DatabaseType } from "../types";
import { API_BASE, DB_LABELS, DB_ROUTES } from "../constatns";
import { recordAction } from "../hyperdx/recorder";
import { recordError } from "./useError";

export interface Task {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  createdAt: string;
}

export function useTaskManager() {
  const [database, setDatabase] = useState<DatabaseType>("memory");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", description: "" });
  const { error, setError, captureError } = recordError();

  const apiPath = `${API_BASE}${DB_ROUTES[database]}`;

  const handleRefreshTask = useCallback(async () => {
    setLoading(true);
    setError(null);
    // recordAction(`📡 Fetching tasks...`);

    try {
      const res = await fetch(apiPath);
      if (!res.ok) throw new Error("Failed to fetch tasks");
      const data = await res.json();
      setTasks(data);
      // recordAction(`✅ Fetched ${data.length} tasks`);
    } catch (err) {
      captureError(err, { operation: "fetchTasks", database });
    } finally {
      setLoading(false);
    }
  }, [apiPath, database]);

  useEffect(() => {
    handleRefreshTask();
  }, [handleRefreshTask]);

  const handleCreatingTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.title.trim()) return;

    // recordAction(
    //   `📝 Creating task in ${DB_LABELS[database]}: ${newTask.title}`
    // );

    try {
      const res = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTask),
      });

      if (!res.ok) throw new Error("Failed to create task");

      const task = await res.json();
      setTasks(prev => [...prev, task]);
      setNewTask({ title: "", description: "" });
      // recordAction(`✅ Created task: ${task.id}`);
    } catch (err) {
      captureError(
        err instanceof Error ? err : new Error("Create task failed")
      );
    }
  };

  const handleToggleTask = async (task: Task) => {
    // recordAction(`🔄 Toggling task in ${DB_LABELS[database]}: ${task.id}`);

    try {
      const res = await fetch(`${apiPath}/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !task.completed }),
      });

      if (!res.ok) throw new Error("Failed to update task");

      const updated = await res.json();
      setTasks(prev => prev.map(t => (t.id === task.id ? updated : t)));
      // recordAction(`✅ Task ${task.completed ? "uncompleted" : "completed"}`);
    } catch (err) {
      err instanceof Error ? err : new Error("Update task failed");
    }
  };

  const handleDeletingTask = async (id: string) => {
    // recordAction(`🗑️ Deleting task from ${DB_LABELS[database]}: ${id}`);

    try {
      const res = await fetch(`${apiPath}/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete task");

      setTasks(prev => prev.filter(t => t.id !== id));
      // recordAction(`✅ Deleted task: ${id}`);
    } catch (err) {
      captureError(
        err instanceof Error ? err : new Error("Delete task failed")
      );
    }
  };

  const handleSlowOperation = async () => {
    // recordAction("🐢 Starting slow operation...");

    try {
      const res = await fetch(`${API_BASE}/tasks/slow`);
      const data = await res.json();
      // recordAction(`✅ Slow operation completed in ${data.duration}ms`);
    } catch (err) {
      captureError(err);
    }
  };

  const handleServerError = async () => {
    // recordAction("💥 Triggering error...");

    try {
      const res = await fetch(`${API_BASE}/tasks/error`);
      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }
    } catch (err) {
      captureError(err instanceof Error ? err : new Error("Simulated error"), {
        intentional: "true",
        operation: "testError",
      });
    }
  };

  const handleCheckingHealth = async () => {
    // recordAction("🏥 Checking health...");

    try {
      const res = await fetch(`${API_BASE}/health`);
      const data = await res.json();
      // recordAction(
      //   `✅ Health: ${data.status}, Uptime: ${data.uptime.toFixed(2)}s`
      // );
    } catch (err) {
      captureError(err);
    }
  };

  const handleFrontError = () => {
    // recordAction("💥 Triggering frontend error...");
    try {
      throw new Error("Intentional frontend error for testing session replay");
    } catch (err) {
      captureError(err, {
        component: "App",
        action: "triggerFrontendError",
      });
    }
  };

  const handleDatabaseChange = (db: DatabaseType) => {
    setDatabase(db);
    setTasks([]);
    // recordAction(`🔀 Switched to ${DB_LABELS[db]}`);
  };

  return {
    // State
    database,
    tasks,
    loading,
    error,
    newTask,
    setNewTask,

    // Handlers
    handleRefreshTask,
    handleCreatingTask,
    handleToggleTask,
    handleDeletingTask,
    handleSlowOperation,
    handleServerError,
    handleCheckingHealth,
    handleFrontError,
    handleDatabaseChange,
  };
}
