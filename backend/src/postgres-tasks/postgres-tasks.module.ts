import { Module } from "@nestjs/common";
import { PostgresTasksController } from "./postgres-tasks.controller";
import { PostgresTasksService } from "./postgres-tasks.service";

@Module({
  controllers: [PostgresTasksController],
  providers: [PostgresTasksService],
})
export class PostgresTasksModule {}
