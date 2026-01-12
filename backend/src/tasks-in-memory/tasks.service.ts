import { Injectable, NotFoundException } from "@nestjs/common";
import { Logger } from "../logger";

export interface Task {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  createdAt: Date;
}

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);
  private readonly tasks = new Map<string, Task>();

  async getAllTasks(): Promise<Task[]> {
    await this.simulateLatency(50, 150);

    const tasks = Array.from(this.tasks.values());

    return tasks;
  }

  async getTaskById(id: string): Promise<Task> {
    await this.simulateLatency(20, 80);

    const task = this.findTaskOrThrow(id, "getById");

    this.logger.debug(
      { taskId: id, completed: task.completed },
      "Retrieved task"
    );
    return task;
  }

  async createTask(data: {
    title: string;
    description: string;
  }): Promise<Task> {
    await this.simulateLatency(100, 200);

    const task: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: data.title,
      description: data.description,
      completed: false,
      createdAt: new Date(),
    };

    this.tasks.set(task.id, task);

    return task;
  }

  async updateTask(id: string, data: Partial<Task>): Promise<Task> {
    await this.simulateLatency(80, 150);

    const task = this.findTaskOrThrow(id, "update");
    const updatedTask = { ...task, ...data };
    this.tasks.set(id, updatedTask);

    return updatedTask;
  }

  async deleteTask(id: string): Promise<void> {
    await this.simulateLatency(50, 100);

    this.findTaskOrThrow(id, "delete");
    this.tasks.delete(id);
  }

  async simulateSlowOperation(): Promise<{ message: string }> {
    await this.simulateLatency(3_000, 2_000);

    return { message: "Slow operation completed" };
  }

  async simulateError(): Promise<never> {
    const errorType = Math.random() > 0.5 ? "database" : "validation";
    throw new Error(`Simulated ${errorType} error for testing observability`);
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private findTaskOrThrow(id: string, operation: string): Task {
    const task = this.tasks.get(id);

    if (task) {
      return task;
    }

    this.logger.warn({ taskId: id }, `Task not found for ${operation}`);
    throw new NotFoundException(`Task with ID ${id} not found`);
  }

  private simulateLatency(min: number, max: number): Promise<void> {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
