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
import { TasksService, Task } from "./tasks.service";

@Controller("tasks")
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  async getAllTasks(): Promise<Task[]> {
    return this.tasksService.getAllTasks();
  }

  @Get("slow")
  async slowOperation() {
    return this.tasksService.simulateSlowOperation();
  }

  @Get("error")
  async errorOperation() {
    return this.tasksService.simulateError();
  }

  @Get(":id")
  async getTask(@Param("id") id: string): Promise<Task> {
    return this.tasksService.getTaskById(id);
  }

  @Post()
  async createTask(
    @Body() body: { title: string; description: string }
  ): Promise<Task> {
    return this.tasksService.createTask(body);
  }

  @Put(":id")
  async updateTask(
    @Param("id") id: string,
    @Body() body: Partial<Task>
  ): Promise<Task> {
    return this.tasksService.updateTask(id, body);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTask(@Param("id") id: string): Promise<void> {
    return this.tasksService.deleteTask(id);
  }
}
