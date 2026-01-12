# Plan: Create 3 Task Controllers (MongoDB, Redis, PostgreSQL)

## Summary

Create 3 separate task controllers with different database backends, each with its own API route prefix. Update frontend with database selector tabs.

**Tech Stack:**
- MongoDB: **Mongoose**
- Redis: **ioredis**
- PostgreSQL: **pg + Prisma**

---

## API Routes

| Database | Route Prefix | Description |
|----------|--------------|-------------|
| In-Memory | `/tasks/*` | Keep existing (comparison baseline) |
| MongoDB | `/mongo/tasks/*` | Mongoose ODM |
| Redis | `/redis/tasks/*` | ioredis with Hash+Set pattern |
| PostgreSQL | `/postgres/tasks/*` | Prisma ORM |

---

## File Structure

```
backend/
├── prisma/
│   └── schema.prisma                    # Prisma schema for PostgreSQL
├── src/
│   ├── shared/
│   │   ├── interfaces/task.interface.ts     # Shared Task, CreateTaskDto, UpdateTaskDto
│   │   └── metrics/database-tasks.metric.ts # Shared metrics with `database` dimension
│   ├── prisma/
│   │   ├── prisma.module.ts             # Global Prisma module
│   │   └── prisma.service.ts            # Prisma client service
│   ├── mongo-tasks/
│   │   ├── mongo-tasks.module.ts
│   │   ├── mongo-tasks.controller.ts
│   │   ├── mongo-tasks.service.ts
│   │   └── schemas/task.schema.ts       # Mongoose schema
│   ├── redis-tasks/
│   │   ├── redis-tasks.module.ts
│   │   ├── redis-tasks.controller.ts
│   │   └── redis-tasks.service.ts
│   ├── postgres-tasks/
│   │   ├── postgres-tasks.module.ts
│   │   ├── postgres-tasks.controller.ts
│   │   └── postgres-tasks.service.ts
│   └── app.module.ts                    # Import all modules + DB connections
```

---

## Implementation Steps

### Step 1: Install Dependencies

```bash
# MongoDB
npm install @nestjs/mongoose mongoose

# Redis
npm install ioredis

# PostgreSQL with Prisma
npm install @prisma/client
npm install -D prisma
npx prisma init
```

### Step 2: Add Database Services to Docker Compose

```yaml
# docker-compose.yml - add these services
mongodb:
  image: mongo:7
  ports: ["27017:27017"]

redis:
  image: redis:7-alpine
  ports: ["6379:6379"]

postgres:
  image: postgres:16-alpine
  ports: ["5432:5432"]
  environment:
    POSTGRES_USER: clickstack
    POSTGRES_PASSWORD: clickstack
    POSTGRES_DB: clickstack
```

### Step 3: Create Prisma Schema

**`backend/prisma/schema.prisma`**
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("POSTGRES_URL")
}

model Task {
  id          String   @id @default(uuid())
  title       String
  description String
  completed   Boolean  @default(false)
  createdAt   DateTime @default(now())
}
```

Then run:
```bash
npx prisma generate
npx prisma db push  # or npx prisma migrate dev
```

### Step 4: Create Prisma Module

**`backend/src/prisma/prisma.service.ts`**
```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

**`backend/src/prisma/prisma.module.ts`**
```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

### Step 5: Create Shared Infrastructure

**`shared/interfaces/task.interface.ts`**
```typescript
export interface Task {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  createdAt: Date;
}

export interface CreateTaskDto {
  title: string;
  description: string;
}

export interface UpdateTaskDto {
  title?: string;
  description?: string;
  completed?: boolean;
}
```

**`shared/metrics/database-tasks.metric.ts`**
- Counter: `db_tasks.operations.total` with attributes: `database`, `operation`, `status`
- Histogram: `db_tasks.operation.duration` with attributes: `database`, `operation`
- UpDownCounter: `db_tasks.active.count` with attribute: `database`

### Step 6: Implement MongoDB Module

- Mongoose schema with `@Schema()` decorator
- Service using `@InjectModel()` for CRUD operations
- Controller at `@Controller("mongo/tasks")`

### Step 7: Implement Redis Module

- Custom provider for `ioredis` client
- Data model: `tasks` (SET for IDs) + `task:{id}` (HASH for data)
- Service with pipeline/multi for atomic operations
- Controller at `@Controller("redis/tasks")`

### Step 8: Implement PostgreSQL Module (Prisma)

**`backend/src/postgres-tasks/postgres-tasks.service.ts`**
```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Task, CreateTaskDto, UpdateTaskDto } from '../shared/interfaces/task.interface';

@Injectable()
export class PostgresTasksService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllTasks(): Promise<Task[]> {
    return this.prisma.task.findMany();
  }

  async getTaskById(id: string): Promise<Task> {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    return task;
  }

  async createTask(data: CreateTaskDto): Promise<Task> {
    return this.prisma.task.create({
      data: { title: data.title, description: data.description },
    });
  }

  async updateTask(id: string, data: UpdateTaskDto): Promise<Task> {
    return this.prisma.task.update({ where: { id }, data });
  }

  async deleteTask(id: string): Promise<void> {
    await this.prisma.task.delete({ where: { id } });
  }
}
```

### Step 9: Update App Module

```typescript
@Module({
  imports: [
    MongooseModule.forRoot(process.env.MONGODB_URI),
    PrismaModule,
    TasksModule,           // existing in-memory
    MongoTasksModule,
    RedisTasksModule,
    PostgresTasksModule,
  ],
})
export class AppModule {}
```

### Step 10: Update Frontend

Add database selector tabs:
```typescript
type DatabaseType = "memory" | "mongodb" | "redis" | "postgres";

const DB_ROUTES = {
  memory: "/tasks",
  mongodb: "/mongo/tasks",
  redis: "/redis/tasks",
  postgres: "/postgres/tasks",
};
```

---

## Environment Variables

```env
# .env additions
MONGODB_URI=mongodb://localhost:27017/clickstack
REDIS_HOST=localhost
REDIS_PORT=6379

# Prisma database URL
POSTGRES_URL=postgresql://clickstack:clickstack@localhost:5432/clickstack
```

---

## OpenTelemetry Benefits

The existing `tracing.ts` already configures auto-instrumentation for:
- `@opentelemetry/instrumentation-pg` - PostgreSQL queries as spans (Prisma uses pg internally)
- `@opentelemetry/instrumentation-ioredis` - Redis commands as spans
- `@opentelemetry/instrumentation-mongodb` - MongoDB operations as spans

All database operations will automatically appear in ClickStack traces!

---

## Verification

1. **Start databases:**
   ```bash
   docker compose up -d mongodb redis postgres
   ```

2. **Generate Prisma client & migrate:**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

3. **Start backend:**
   ```bash
   npm run start:dev
   ```

4. **Test each endpoint:**
   ```bash
   # MongoDB
   curl -X POST http://localhost:3000/mongo/tasks \
     -H "Content-Type: application/json" \
     -d '{"title":"Test","description":"MongoDB task"}'

   # Redis
   curl -X POST http://localhost:3000/redis/tasks \
     -H "Content-Type: application/json" \
     -d '{"title":"Test","description":"Redis task"}'

   # PostgreSQL
   curl -X POST http://localhost:3000/postgres/tasks \
     -H "Content-Type: application/json" \
     -d '{"title":"Test","description":"Postgres task"}'
   ```

5. **Check ClickStack:**
   - Verify traces show database spans (MongoDB find, Redis HSET, PostgreSQL SELECT)
   - Check metrics: `db_tasks.operations.total` with `database` attribute

6. **Frontend:**
   - Switch between tabs
   - Verify each database shows independent task lists

---

## Files to Modify/Create

| File | Action |
|------|--------|
| `backend/package.json` | Add dependencies |
| `docker-compose.yml` | Add database services |
| `backend/.env` | Add database connection vars |
| `backend/prisma/schema.prisma` | Create Prisma schema |
| `backend/src/prisma/prisma.module.ts` | Create |
| `backend/src/prisma/prisma.service.ts` | Create |
| `backend/src/shared/interfaces/task.interface.ts` | Create |
| `backend/src/shared/metrics/database-tasks.metric.ts` | Create |
| `backend/src/mongo-tasks/*` | Create (4 files) |
| `backend/src/redis-tasks/*` | Create (3 files) |
| `backend/src/postgres-tasks/*` | Create (3 files) |
| `backend/src/app.module.ts` | Modify |
| `frontend/src/App.tsx` | Modify |
