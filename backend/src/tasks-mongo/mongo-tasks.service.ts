import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { TaskDocument } from "./schemas/task.schema";
import {
  Task,
  CreateTaskDto,
  UpdateTaskDto,
} from "../shared/interfaces/task.interface";

@Injectable()
export class MongoTasksService {
  private readonly DB = "mongodb" as const;

  constructor(
    @InjectModel(TaskDocument.name) private taskModel: Model<TaskDocument>
  ) {}

  async getAllTasks(): Promise<Task[]> {
    const docs = await this.taskModel.find().exec();
    const tasks = docs.map(doc => this.toTask(doc));
    return tasks;
  }

  async getTaskById(id: string): Promise<Task> {
    const doc = await this.taskModel.findById(id).exec();

    if (!doc) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return this.toTask(doc);
  }

  async createTask(data: CreateTaskDto): Promise<Task> {
    const doc = await this.taskModel.create({
      title: data.title,
      description: data.description,
      completed: false,
    });

    return this.toTask(doc);
  }

  async updateTask(id: string, data: UpdateTaskDto): Promise<Task> {
    const doc = await this.taskModel
      .findByIdAndUpdate(id, data, { new: true })
      .exec();

    if (!doc) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return this.toTask(doc);
  }

  async deleteTask(id: string): Promise<void> {
    const result = await this.taskModel.findByIdAndDelete(id).exec();

    if (!result) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
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
