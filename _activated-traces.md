# Enabled Traces

A list of all trace instrumentations currently configured in the ClickStack OTEL backend.

---

## Database Instrumentations

### PostgreSQL (Prisma ORM)

**Package**: `@prisma/instrumentation`

> **Note**: Native `@opentelemetry/instrumentation-pg` is **disabled** because Prisma uses its own query engine. Prisma instrumentation provides better visibility into ORM operations.

| Configuration | Value | Purpose |
|---------------|-------|---------|
| Default | `new PrismaInstrumentation()` | Traces all Prisma client operations |

#### Span Hierarchy

```
prisma:client:operation (findMany, create, update, delete, etc.)
└── prisma:engine:query (actual SQL execution)
```

#### Span Attributes

| Attribute | Example | Description |
|-----------|---------|-------------|
| `db.system` | `postgresql` | Database type |
| `db.type` | `sql` | Database category |
| `db.statement` | `SELECT "Task"."id"... FROM "Task"` | Generated SQL query |
| `prisma.model` | `Task` | Prisma model name |
| `prisma.operation` | `findMany` | Prisma operation type |

#### Traced Operations

| Span Name | Description |
|-----------|-------------|
| `prisma:client:operation` | High-level Prisma method (findMany, create, etc.) |
| `prisma:engine:query` | Low-level database query execution |
| `prisma:engine:serialize` | Result serialization |

---

### Redis (ioredis)

**Package**: `@opentelemetry/instrumentation-ioredis`

| Configuration | Value | Purpose |
|---------------|-------|---------|
| `dbStatementSerializer` | Custom function | Format command with truncation for large values |

#### Span Attributes

| Attribute | Example | Description |
|-----------|---------|-------------|
| `db.system` | `redis` | Database type |
| `db.statement` | `GET user:123` | Redis command |
| `db.operation` | `GET` | Command name |
| `net.peer.name` | `localhost` | Redis host |
| `net.peer.port` | `6379` | Redis port |
| `db.redis.database_index` | `0` | Redis DB index |

#### Supported Commands

All Redis commands are traced, including:
- Key operations: `GET`, `SET`, `DEL`, `EXISTS`, `EXPIRE`
- Hash operations: `HGET`, `HSET`, `HMGET`, `HGETALL`
- List operations: `LPUSH`, `RPUSH`, `LPOP`, `LRANGE`
- Set operations: `SADD`, `SMEMBERS`, `SISMEMBER`
- Sorted set operations: `ZADD`, `ZRANGE`, `ZRANGEBYSCORE`
- Pub/Sub: `PUBLISH`, `SUBSCRIBE`
- Transactions: `MULTI`, `EXEC`

---

### MongoDB (Mongoose)

**Package**: `@opentelemetry/instrumentation-mongodb`

| Configuration | Value | Purpose |
|---------------|-------|---------|
| `enhancedDatabaseReporting` | `true` | Include query filter in `db.statement` |

#### Span Attributes

| Attribute | Example | Description |
|-----------|---------|-------------|
| `db.system` | `mongodb` | Database type |
| `db.name` | `mydb` | Database name |
| `db.mongodb.collection` | `users` | Collection name |
| `db.operation` | `find` | Operation type |
| `db.statement` | `{"name":"John"}` | Query filter (JSON) |
| `net.peer.name` | `localhost` | MongoDB host |
| `net.peer.port` | `27017` | MongoDB port |

#### Traced Operations

| Operation | Description |
|-----------|-------------|
| `find` | Query documents |
| `findOne` | Query single document |
| `insertOne` | Insert single document |
| `insertMany` | Insert multiple documents |
| `updateOne` | Update single document |
| `updateMany` | Update multiple documents |
| `deleteOne` | Delete single document |
| `deleteMany` | Delete multiple documents |
| `aggregate` | Aggregation pipeline |
| `createIndex` | Index creation |

---

## HTTP Instrumentations

### HTTP Server/Client

**Package**: `@opentelemetry/instrumentation-http`

#### Server Span Attributes

| Attribute | Example | Description |
|-----------|---------|-------------|
| `http.method` | `GET` | HTTP method |
| `http.url` | `/api/users/123` | Request URL |
| `http.target` | `/api/users/123` | URL path |
| `http.status_code` | `200` | Response status |
| `http.route` | `/api/users/:id` | Route pattern |
| `net.peer.ip` | `192.168.1.1` | Client IP |
| `user_agent.original` | `Mozilla/5.0...` | User agent |

#### Client Span Attributes

| Attribute | Example | Description |
|-----------|---------|-------------|
| `http.method` | `POST` | HTTP method |
| `http.url` | `https://api.example.com/data` | Request URL |
| `http.status_code` | `201` | Response status |
| `net.peer.name` | `api.example.com` | Target host |
| `net.peer.port` | `443` | Target port |

---

## NestJS Instrumentation

**Package**: `@opentelemetry/instrumentation-nestjs-core`

#### Span Attributes

| Attribute | Example | Description |
|-----------|---------|-------------|
| `nestjs.type` | `handler` | Component type |
| `nestjs.controller` | `TasksController` | Controller name |
| `nestjs.handler` | `findAll` | Handler method name |
| `nestjs.callback` | `TasksController.findAll` | Full callback path |

---

## Trace Flow Example

```
HTTP Request (incoming)
├── NestJS Handler (TasksController.create)
│   ├── PostgreSQL (INSERT INTO tasks...)
│   ├── Redis (SET task:123 ...)
│   └── MongoDB (tasks.insertOne)
└── HTTP Response
```

Each operation creates a child span with timing and attributes.

---

## Configuration Reference

```typescript
// backend/src/tracing.ts
getNodeAutoInstrumentations({
  // File system (disabled - too noisy)
  "@opentelemetry/instrumentation-fs": { enabled: false },

  // HTTP - with filtering for health checks and OTLP calls
  "@opentelemetry/instrumentation-http": {
    ignoreIncomingRequestHook: request => {
      const url = request.url || "";
      return url === "/health" || url === "/metrics";
    },
    ignoreOutgoingRequestHook: request => {
      const host = request.hostname || request.host || "";
      return host.includes("localhost:8080"); // ClickStack UI
    },
  },

  // Pino - adds service metadata to logs
  "@opentelemetry/instrumentation-pino": {
    logHook: (span, record) => {
      record["service.name"] = SERVICE_NAME;
      record["service.version"] = SERVICE_VERSION;
      record["service.env"] = DEPLOYMENT_ENV;
    },
  },

  // PostgreSQL (pg) - disabled, using Prisma instead
  "@opentelemetry/instrumentation-pg": { enabled: false },

  // Redis
  "@opentelemetry/instrumentation-ioredis": {
    dbStatementSerializer: (cmdName, cmdArgs) => {
      return `${cmdName} ${cmdArgs.map(arg =>
        typeof arg === "string" && arg.length > 100
          ? arg.substring(0, 100) + "..."
          : arg
      ).join(" ")}`;
    },
  },

  // MongoDB
  "@opentelemetry/instrumentation-mongodb": {
    enhancedDatabaseReporting: true,
  },
}),

// Prisma ORM tracing (separate from auto-instrumentations)
new PrismaInstrumentation(),
```

---

## Useful Queries (ClickHouse)

### Slow Database Queries

```sql
SELECT
  SpanName,
  SpanAttributes['db.system'] as db_system,
  SpanAttributes['db.statement'] as statement,
  Duration / 1000000 as duration_ms
FROM otel_traces
WHERE SpanAttributes['db.system'] != ''
  AND Duration > 100000000  -- > 100ms
ORDER BY Duration DESC
LIMIT 20
```

### Redis Command Distribution

```sql
SELECT
  SpanAttributes['db.operation'] as command,
  count() as count,
  avg(Duration) / 1000000 as avg_ms
FROM otel_traces
WHERE SpanAttributes['db.system'] = 'redis'
GROUP BY command
ORDER BY count DESC
```

### Database Errors

```sql
SELECT
  SpanName,
  SpanAttributes['db.system'] as db,
  SpanAttributes['db.statement'] as statement,
  StatusMessage
FROM otel_traces
WHERE SpanAttributes['db.system'] != ''
  AND StatusCode = 'ERROR'
ORDER BY Timestamp DESC
LIMIT 50
```
