import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AppController } from "./app.controller";
import { TasksModule } from "./tasks-in-memory/tasks.module";
import { MongoTasksModule } from "./tasks-mongo/mongo-tasks.module";
import { RedisTasksModule } from "./tasks-redis/redis-tasks.module";
import { PostgresTasksModule } from "./tasks-postgres/postgres-tasks.module";

@Module({
  imports: [
    TasksModule,
    MongooseModule.forRoot(process.env.MONGODB_URI!!),
    MongoTasksModule,
    RedisTasksModule,
    PostgresTasksModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
