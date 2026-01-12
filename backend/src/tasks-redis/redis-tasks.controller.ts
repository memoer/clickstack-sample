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
import { RedisTasksService } from "./redis-tasks.service";
import {
  Task,
  CreateTaskDto,
  UpdateTaskDto,
} from "../shared/interfaces/task.interface";

@Controller("redis/tasks")
export class RedisTasksController {
  constructor(private readonly tasksService: RedisTasksService) {}

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
