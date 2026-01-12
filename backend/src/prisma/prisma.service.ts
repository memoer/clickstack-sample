import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { Logger } from "../logger";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    this.logger.info({}, "Prisma connected to PostgreSQL");
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.info({}, "Prisma disconnected from PostgreSQL");
  }
}
