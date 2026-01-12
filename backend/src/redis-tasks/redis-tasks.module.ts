import { Module, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import { RedisTasksController } from "./redis-tasks.controller";
import { RedisTasksService } from "./redis-tasks.service";
import { Logger } from "../logger";

export const REDIS_CLIENT = "REDIS_CLIENT";

@Module({
  controllers: [RedisTasksController],
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => {
        const logger = new Logger("RedisModule");
        const redis = new Redis({
          host: process.env.REDIS_HOST,
          port: parseInt(process.env.REDIS_PORT!!, 10),
          lazyConnect: true,
        });

        redis.on("connect", () => {
          logger.info({}, "Redis connected");
        });

        redis.on("error", err => {
          logger.error(err, "Redis connection error");
        });

        redis.connect().catch(err => {
          logger.error(err, "Failed to connect to Redis");
        });

        return redis;
      },
    },
    RedisTasksService,
  ],
})
export class RedisTasksModule implements OnModuleDestroy {
  constructor() {}

  // Inject redis client for cleanup
  private redis: Redis | null = null;

  setRedis(redis: Redis) {
    this.redis = redis;
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}
