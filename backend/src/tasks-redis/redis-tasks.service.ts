import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import Redis from "ioredis";
import {
  Task,
  CreateTaskDto,
  UpdateTaskDto,
} from "../shared/interfaces/task.interface";
import {
  recordDbMetrics,
  dbTaskOperationsCounter,
} from "../shared/metrics/database-tasks.metric";
import { REDIS_CLIENT } from "./redis-tasks.constants";

const TASKS_KEY = "tasks";
const TASK_PREFIX = "task:";

@Injectable()
export class RedisTasksService {
  private readonly DB = "redis" as const;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async getAllTasks(): Promise<Task[]> {
    const startTime = Date.now();

    // Get all task IDs from the set
    const taskIds = await this.redis.smembers(TASKS_KEY);

    if (taskIds.length === 0) {
      recordDbMetrics(this.DB, "getAll", startTime);
      return [];
    }

    // Get all tasks using pipeline for efficiency
    const pipeline = this.redis.pipeline();
    taskIds.forEach(id => pipeline.hgetall(`${TASK_PREFIX}${id}`));
    const results = await pipeline.exec();

    const tasks =
      results
        ?.map(([err, data], index) => {
          if (err || !data || Object.keys(data as object).length === 0)
            return null;
          return this.hashToTask(
            taskIds[index],
            data as Record<string, string>
          );
        })
        .filter((t): t is Task => t !== null) ?? [];

    recordDbMetrics(this.DB, "getAll", startTime);
    return tasks;
  }

  async getTaskById(id: string): Promise<Task> {
    const startTime = Date.now();
    const data = await this.redis.hgetall(`${TASK_PREFIX}${id}`);

    if (!data || Object.keys(data).length === 0) {
      dbTaskOperationsCounter.add(1, {
        database: this.DB,
        operation: "getById",
        status: "not_found",
      });
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    recordDbMetrics(this.DB, "getById", startTime);
    return this.hashToTask(id, data);
  }

  async createTask(data: CreateTaskDto): Promise<Task> {
    const startTime = Date.now();
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const createdAt = new Date().toISOString();

    const taskData = {
      title: data.title,
      description: data.description,
      completed: "false",
      createdAt,
    };

    // Use transaction to ensure atomicity
    await this.redis
      .multi()
      .hset(`${TASK_PREFIX}${id}`, taskData)
      .sadd(TASKS_KEY, id)
      .exec();

    recordDbMetrics(this.DB, "create", startTime);

    return {
      id,
      title: data.title,
      description: data.description,
      completed: false,
      createdAt: new Date(createdAt),
    };
  }

  async updateTask(id: string, data: UpdateTaskDto): Promise<Task> {
    const startTime = Date.now();
    const exists = await this.redis.exists(`${TASK_PREFIX}${id}`);

    if (!exists) {
      dbTaskOperationsCounter.add(1, {
        database: this.DB,
        operation: "update",
        status: "not_found",
      });
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    const updateData: Record<string, string> = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.completed !== undefined)
      updateData.completed = String(data.completed);

    if (Object.keys(updateData).length > 0) {
      await this.redis.hset(`${TASK_PREFIX}${id}`, updateData);
    }

    const updated = await this.redis.hgetall(`${TASK_PREFIX}${id}`);

    recordDbMetrics(this.DB, "update", startTime);
    return this.hashToTask(id, updated);
  }

  async deleteTask(id: string): Promise<void> {
    const startTime = Date.now();
    const exists = await this.redis.exists(`${TASK_PREFIX}${id}`);

    if (!exists) {
      dbTaskOperationsCounter.add(1, {
        database: this.DB,
        operation: "delete",
        status: "not_found",
      });
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    await this.redis
      .multi()
      .del(`${TASK_PREFIX}${id}`)
      .srem(TASKS_KEY, id)
      .exec();

    recordDbMetrics(this.DB, "delete", startTime);
  }

  private hashToTask(id: string, data: Record<string, string>): Task {
    return {
      id,
      title: data.title,
      description: data.description,
      completed: data.completed === "true",
      createdAt: new Date(data.createdAt),
    };
  }
}
