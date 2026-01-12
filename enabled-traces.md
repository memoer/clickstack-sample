# Enabled Traces

A list of all trace instrumentations currently configured in the ClickStack OTEL backend.

---

## Database Instrumentations

### PostgreSQL (pg)

**Package**: `@opentelemetry/instrumentation-pg`

| Configuration | Value | Purpose |
|---------------|-------|---------|
| `enhancedDatabaseReporting` | `true` | Include sanitized SQL in `db.statement` |
| `addSqlCommenterCommentToQueries` | `true` | Add trace context as SQL comment |

#### Span Attributes

| Attribute | Example | Description |
|-----------|---------|-------------|
| `db.system` | `postgresql` | Database type |
| `db.name` | `mydb` | Database name |
| `db.user` | `postgres` | Database user |
| `db.statement` | `SELECT * FROM users WHERE id = $1` | SQL query (sanitized) |
| `db.operation` | `SELECT` | SQL operation |
| `net.peer.name` | `localhost` | PostgreSQL host |
| `net.peer.port` | `5432` | PostgreSQL port |
| `db.sql.table` | `users` | Target table (when detectable) |

#### SQL Commenter Example

When `addSqlCommenterCommentToQueries: true`, your queries include trace context:

```sql
SELECT * FROM users WHERE id = $1
/*traceparent='00-abc123-def456-01'*/
```

This allows correlating database slow query logs with distributed traces.

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
  // PostgreSQL
  "@opentelemetry/instrumentation-pg": {
    enhancedDatabaseReporting: true,
    addSqlCommenterCommentToQueries: true,
  },
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
