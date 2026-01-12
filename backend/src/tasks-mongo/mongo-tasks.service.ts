import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { TaskDocument } from "./schemas/task.schema";
import {
  Task,
  CreateTaskDto,
  UpdateTaskDto,
} from "../shared/interfaces/task.interface";
import {
  recordDbMetrics,
  dbTaskOperationsCounter,
} from "../shared/metrics/database-tasks.metric";

@Injectable()
export class MongoTasksService {
  private readonly DB = "mongodb" as const;

  constructor(
    @InjectModel(TaskDocument.name) private taskModel: Model<TaskDocument>
  ) {}

  async getAllTasks(): Promise<Task[]> {
    const startTime = Date.now();
    const docs = await this.taskModel.find().exec();
    const tasks = docs.map(doc => this.toTask(doc));

    recordDbMetrics(this.DB, "getAll", startTime);
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

    recordDbMetrics(this.DB, "create", startTime);
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

    recordDbMetrics(this.DB, "delete", startTime);
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
