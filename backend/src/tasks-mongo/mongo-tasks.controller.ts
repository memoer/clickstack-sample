import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { MongoTasksService } from "./mongo-tasks.service";
import {
  Task,
  CreateTaskDto,
  UpdateTaskDto,
} from "../shared/interfaces/task.interface";

@Controller("mongo/tasks")
export class MongoTasksController {
  constructor(private readonly tasksService: MongoTasksService) {}

  @Get()
  async getAllTasks(): Promise<Task[]> {
    return this.tasksService.getAllTasks();
  }

  @Get(":id")
  async getTask(@Param("id") id: string): Promise<Task> {
    return this.tasksService.getTaskById(id);
  }

  @Post()
  async createTask(@Body() body: CreateTaskDto): Promise<Task> {
    return this.tasksService.createTask(body);
  }

  @Put(":id")
  async updateTask(
    @Param("id") id: string,
    @Body() body: UpdateTaskDto
  ): Promise<Task> {
    return this.tasksService.updateTask(id, body);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTask(@Param("id") id: string): Promise<void> {
    return this.tasksService.deleteTask(id);
  }
}
