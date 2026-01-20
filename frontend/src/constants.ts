import { DatabaseType } from "./types";

export const TARGET_API_ENDPOINT = "http://localhost:3000";

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
