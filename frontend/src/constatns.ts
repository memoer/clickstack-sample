import { DatabaseType } from "./types";

export const API_BASE = import.meta.env.VITE_API_URL;

export const DB_ROUTES: Record<DatabaseType, string> = {
  memory: "/tasks",
  mongodb: "/mongo/tasks",
  redis: "/redis/tasks",
  postgres: "/postgres/tasks",
};

export const DB_LABELS: Record<DatabaseType, string> = {
  memory: "In-Memory",
  mongodb: "MongoDB",
  redis: "Redis",
  postgres: "PostgreSQL",
};
