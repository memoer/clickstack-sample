import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Logger } from "../logger";
import { TaskDocument } from "./schemas/task.schema";
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
export class MongoTasksService {
  private readonly logger = new Logger(MongoTasksService.name);
  private readonly DB = "mongodb" as const;

  constructor(
    @InjectModel(TaskDocument.name) private taskModel: Model<TaskDocument>
  ) {}

  async getAllTasks(): Promise<Task[]> {
    const startTime = Date.now();
    const docs = await this.taskModel.find().exec();
    const tasks = docs.map((doc) => this.toTask(doc));

    recordDbMetrics(this.DB, "getAll", startTime);
    this.logger.info({ count: tasks.length, db: this.DB }, "Retrieved all tasks");
    return tasks;
  }

  async getTaskById(id: string): Promise<Task> {
    const startTime = Date.now();
    const doc = await this.taskModel.findById(id).exec();

    if (!doc) {
      dbTaskOperationsCounter.add(1, {
        database: this.DB,
        operation: "getById",
        status: "not_found",
      });
      this.logger.warn({ taskId: id, db: this.DB }, "Task not found");
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    recordDbMetrics(this.DB, "getById", startTime);
    return this.toTask(doc);
  }

  async createTask(data: CreateTaskDto): Promise<Task> {
    const startTime = Date.now();
    const doc = await this.taskModel.create({
      title: data.title,
      description: data.description,
      completed: false,
    });

    dbActiveTasksGauge.add(1, { database: this.DB });
    recordDbMetrics(this.DB, "create", startTime);
    this.logger.info(
      { taskId: doc._id.toString(), db: this.DB },
      "Task created"
    );
    return this.toTask(doc);
  }

  async updateTask(id: string, data: UpdateTaskDto): Promise<Task> {
    const startTime = Date.now();
    const doc = await this.taskModel
      .findByIdAndUpdate(id, data, { new: true })
      .exec();

    if (!doc) {
      dbTaskOperationsCounter.add(1, {
        database: this.DB,
        operation: "update",
        status: "not_found",
      });
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    recordDbMetrics(this.DB, "update", startTime);
    this.logger.info({ taskId: id, db: this.DB }, "Task updated");
    return this.toTask(doc);
  }

  async deleteTask(id: string): Promise<void> {
    const startTime = Date.now();
    const result = await this.taskModel.findByIdAndDelete(id).exec();

    if (!result) {
      dbTaskOperationsCounter.add(1, {
        database: this.DB,
        operation: "delete",
        status: "not_found",
      });
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    dbActiveTasksGauge.add(-1, { database: this.DB });
    recordDbMetrics(this.DB, "delete", startTime);
    this.logger.info({ taskId: id, db: this.DB }, "Task deleted");
  }

  private toTask(doc: TaskDocument): Task {
    return {
      id: doc._id.toString(),
      title: doc.title,
      description: doc.description,
      completed: doc.completed,
      createdAt: doc.createdAt,
    };
  }
}
