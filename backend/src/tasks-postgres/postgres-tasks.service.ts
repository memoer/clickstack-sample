import { Injectable, NotFoundException } from "@nestjs/common";
import {
  Task,
  CreateTaskDto,
  UpdateTaskDto,
} from "../shared/interfaces/task.interface";
import {
  recordDbMetrics,
  dbTaskOperationsCounter,
} from "../shared/metrics/database-tasks.metric";
import { prismaMain } from "src/prisma-client";

@Injectable()
export class PostgresTasksService {
  private readonly DB = "postgres" as const;

  async getAllTasks(): Promise<Task[]> {
    const startTime = Date.now();
    const tasks = await prismaMain.task.findMany({
      orderBy: { createdAt: "desc" },
    });

    recordDbMetrics(this.DB, "getAll", startTime);
    return tasks;
  }

  async getTaskById(id: string): Promise<Task> {
    const startTime = Date.now();
    const task = await prismaMain.task.findUnique({ where: { id } });

    if (!task) {
      dbTaskOperationsCounter.add(1, {
        database: this.DB,
        operation: "getById",
        status: "not_found",
      });
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    recordDbMetrics(this.DB, "getById", startTime);
    return task;
  }

  async createTask(data: CreateTaskDto): Promise<Task> {
    const startTime = Date.now();
    const task = await prismaMain.task.create({
      data: {
        title: data.title,
        description: data.description,
      },
    });

    recordDbMetrics(this.DB, "create", startTime);
    return task;
  }

  async updateTask(id: string, data: UpdateTaskDto): Promise<Task> {
    const startTime = Date.now();

    try {
      const task = await prismaMain.task.update({
        where: { id },
        data,
      });

      recordDbMetrics(this.DB, "update", startTime);
      return task;
    } catch (error) {
      // Prisma throws when record not found
      if ((error as { code?: string }).code === "P2025") {
        dbTaskOperationsCounter.add(1, {
          database: this.DB,
          operation: "update",
          status: "not_found",
        });
        throw new NotFoundException(`Task with ID ${id} not found`);
      }
      throw error;
    }
  }

  async deleteTask(id: string): Promise<void> {
    const startTime = Date.now();

    try {
      await prismaMain.task.delete({ where: { id } });

      recordDbMetrics(this.DB, "delete", startTime);
    } catch (error) {
      // Prisma throws when record not found
      if ((error as { code?: string }).code === "P2025") {
        dbTaskOperationsCounter.add(1, {
          database: this.DB,
          operation: "delete",
          status: "not_found",
        });
        throw new NotFoundException(`Task with ID ${id} not found`);
      }
      throw error;
    }
  }
}
