import { Injectable, NotFoundException } from "@nestjs/common";
import {
  Task,
  CreateTaskDto,
  UpdateTaskDto,
} from "../shared/interfaces/task.interface";
import { prismaMain } from "src/prisma-client";

@Injectable()
export class PostgresTasksService {
  private readonly DB = "postgres" as const;

  async getAllTasks(): Promise<Task[]> {
    const tasks = await prismaMain.task.findMany({
      orderBy: { createdAt: "desc" },
    });
    return tasks;
  }

  async getTaskById(id: string): Promise<Task> {
    const task = await prismaMain.task.findUnique({ where: { id } });

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return task;
  }

  async createTask(data: CreateTaskDto): Promise<Task> {
    const task = await prismaMain.task.create({
      data: {
        title: data.title,
        description: data.description,
      },
    });

    return task;
  }

  async updateTask(id: string, data: UpdateTaskDto): Promise<Task> {
    try {
      const task = await prismaMain.task.update({
        where: { id },
        data,
      });

      return task;
    } catch (error) {
      // Prisma throws when record not found
      if ((error as { code?: string }).code === "P2025") {
        throw new NotFoundException(`Task with ID ${id} not found`);
      }
      throw error;
    }
  }

  async deleteTask(id: string): Promise<void> {
    try {
      await prismaMain.task.delete({ where: { id } });
    } catch (error) {
      // Prisma throws when record not found
      if ((error as { code?: string }).code === "P2025") {
        throw new NotFoundException(`Task with ID ${id} not found`);
      }
      throw error;
    }
  }
}
