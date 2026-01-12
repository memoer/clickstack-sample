import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { MongoTasksController } from "./mongo-tasks.controller";
import { MongoTasksService } from "./mongo-tasks.service";
import { TaskDocument, TaskSchema } from "./schemas/task.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TaskDocument.name, schema: TaskSchema },
    ]),
  ],
  controllers: [MongoTasksController],
  providers: [MongoTasksService],
})
export class MongoTasksModule {}
