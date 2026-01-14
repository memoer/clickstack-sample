import { useState, useCallback, useEffect } from "react";
import Config from "react-native-config";
import { Task } from "../types";
import { recordAction, recordException } from "../observability";

const API_URL = Config.API_URL;

export const useTaskManager = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    recordAction("Fetching tasks", { operation: "fetch" });

    try {
      const response = await fetch(`${API_URL}/postgres/tasks`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = (await response.json()) as Task[];
      setTasks(data);
      recordAction("Tasks fetched successfully", { count: data.length });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch tasks";
      setError(message);
      recordException(err, "Failed to fetch tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  const createTask = useCallback(async (title: string) => {
    setLoading(true);
    setError(null);
    recordAction("Creating task", { operation: "create", title });

    try {
      const response = await fetch(`${API_URL}/postgres/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description: "" }),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const newTask = (await response.json()) as Task;
      setTasks(prev => [...prev, newTask]);
      recordAction("Task created successfully", { taskId: newTask.id, title });
      return newTask;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create task";
      setError(message);
      recordException(err, "Failed to create task", { title });
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteTask = useCallback(async (taskId: string) => {
    setLoading(true);
    setError(null);
    recordAction("Deleting task", { operation: "delete", taskId });

    try {
      const response = await fetch(`${API_URL}/postgres/tasks/${taskId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      setTasks(prev => prev.filter(task => task.id !== taskId));
      recordAction("Task deleted successfully", { taskId });
      return true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete task";
      setError(message);
      recordException(err, "Failed to delete task", { taskId });
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  return {
    tasks,
    loading,
    error,
    fetchTasks,
    createTask,
    deleteTask,
  };
};
