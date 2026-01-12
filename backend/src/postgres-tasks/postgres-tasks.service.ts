import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Logger } from "../logger";
import {
  Task,
  CreateTaskDto,
  UpdateTaskDto,
} from "../shared/interfaces/task.interface";
import {
  recordDbMetrics,
  dbActiveTasksGauge,
  dbTaskOperationsCounter,
} from "../shared/metrics/database-tasks.metric";

@Injectable()
export class PostgresTasksService {
  private readonly logger = new Logger(PostgresTasksService.name);
  private readonly DB = "postgres" as const;

  constructor(private readonly prisma: PrismaService) {}

  async getAllTasks(): Promise<Task[]> {
    const startTime = Date.now();
    const tasks = await this.prisma.task.findMany({
      orderBy: { createdAt: "desc" },
    });

    recordDbMetrics(this.DB, "getAll", startTime);
    this.logger.info({ count: tasks.length, db: this.DB }, "Retrieved all tasks");
    return tasks;
  }

  async getTaskById(id: string): Promise<Task> {
    const startTime = Date.now();
    const task = await this.prisma.task.findUnique({ where: { id } });

    if (!task) {
      dbTaskOperationsCounter.add(1, {
        database: this.DB,
        operation: "getById",
        status: "not_found",
      });
      this.logger.warn({ taskId: id, db: this.DB }, "Task not found");
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    recordDbMetrics(this.DB, "getById", startTime);
    return task;
  }

  async createTask(data: CreateTaskDto): Promise<Task> {
    const startTime = Date.now();
    const task = await this.prisma.task.create({
      data: {
        title: data.title,
        description: data.description,
      },
    });

    dbActiveTasksGauge.add(1, { database: this.DB });
    recordDbMetrics(this.DB, "create", startTime);
    this.logger.info({ taskId: task.id, db: this.DB }, "Task created");
    return task;
  }

  async updateTask(id: string, data: UpdateTaskDto): Promise<Task> {
    const startTime = Date.now();

    try {
      const task = await this.prisma.task.update({
        where: { id },
        data,
      });

      recordDbMetrics(this.DB, "update", startTime);
      this.logger.info({ taskId: id, db: this.DB }, "Task updated");
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
      await this.prisma.task.delete({ where: { id } });

      dbActiveTasksGauge.add(-1, { database: this.DB });
      recordDbMetrics(this.DB, "delete", startTime);
      this.logger.info({ taskId: id, db: this.DB }, "Task deleted");
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
