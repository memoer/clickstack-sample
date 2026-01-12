import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { TasksModule } from "./tasks/tasks.module";
import { PrismaModule } from "./prisma/prisma.module";
import { MongoTasksModule } from "./mongo-tasks/mongo-tasks.module";
import { RedisTasksModule } from "./redis-tasks/redis-tasks.module";
import { PostgresTasksModule } from "./postgres-tasks/postgres-tasks.module";

@Module({
  imports: [
    // Task modules
    TasksModule, // Original in-memory (keep for comparison)
    MongooseModule.forRoot(process.env.MONGODB_URI!!),
    MongoTasksModule,
    RedisTasksModule,
    PrismaModule,
    PostgresTasksModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
