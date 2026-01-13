# ClickStack Demo (Vendor-neutral OpenTelemetry)

NestJS + React (Vite) + **Vanilla OpenTelemetry** + **Pino** 데모 프로젝트

> **이 프로젝트는 벤더 중립적입니다!**
> OTLP 엔드포인트만 변경하면 어떤 observability 백엔드로도 전환 가능합니다.

## 요구 사항

- **Node.js**: v20.0.0 이상 (v24.x 권장)
- **npm**: v10 이상
- **Docker**: Docker Compose v2 이상

## 지원하는 Observability Signals

| Signal | Backend | Frontend | 구현 방식 |
|--------|---------|----------|----------|
| **Logs** | ✅ | ✅ | Backend: Pino → OTLP / Frontend: Console capture → OTLP |
| **Metrics** | ✅ | ✅ | OpenTelemetry Metrics API + Web Vitals (CLS, INP, LCP, TTFB, FCP) |
| **Traces** | ✅ | ✅ | Auto-instrumentation + 커스텀 스팬 |
| **Session Replay** | - | ✅ | HyperDX Browser SDK (vendor-specific, 표준 없음) |

> **Note**: Session Replay는 현재 표준화된 OpenTelemetry 스펙이 없어 HyperDX SDK를 사용합니다.
> 다른 벤더로 전환 시 해당 벤더의 Session Replay SDK로 교체 필요.

## 아키텍처

### 데이터 플로우

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         YOUR APPLICATION                                 │
├────────────────────────────────┬────────────────────────────────────────┤
│      Backend (NestJS)          │           Frontend (React)              │
│                                │                                         │
│  ┌──────────────────────────┐  │  ┌──────────────────────────────────┐  │
│  │ Vanilla OpenTelemetry    │  │  │     @hyperdx/browser SDK         │  │
│  │ + Pino Logger            │  │  │                                  │  │
│  │                          │  │  │ • Session Replay                 │  │
│  │ • Traces (100%)          │  │  │ • Console Logs                   │  │
│  │ • Logs (Pino → OTLP)     │  │  │ • Fetch Traces                   │  │
│  │ • Custom Metrics         │  │  │ • Errors                         │  │
│  └────────────┬─────────────┘  │  └───────────────┬──────────────────┘  │
└───────────────┼────────────────┴──────────────────┼──────────────────────┘
                │                                   │
                │ OTLP/gRPC (4317)                  │ OTLP/HTTP (4318)
                ▼                                   │
┌───────────────────────────────────────┐           │
│      OTEL Collector (External)        │           │
│                                       │           │
│  Tail-Based Sampling:                 │           │
│  • ERROR traces    → 100% keep        │           │
│  • HTTP 4xx/5xx    → 100% keep        │           │
│  • Latency > 2s    → 100% keep        │           │
│  • Normal traces   → 10% sample       │           │
│                                       │           │
│  Result: ~80-90% storage reduction    │           │
└───────────────┬───────────────────────┘           │
                │                                   │
                │ OTLP/HTTP (4318)                  │
                ▼                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     ClickStack (HyperDX)                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │
│  │  Embedded OTEL  │  │   ClickHouse    │  │   HyperDX UI    │          │
│  │   Collector     │──│                 │──│                 │          │
│  │   (Ingestion)   │  │  • otel_logs    │  │  • Search       │          │
│  └─────────────────┘  │  • otel_traces  │  │  • Dashboards   │          │
│                       │  • otel_metrics │  │  • Sessions     │          │
│                       └─────────────────┘  └─────────────────┘          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 벤더 중립성 (Vendor-neutral)

OTLP 엔드포인트만 변경하면 다른 백엔드로 전환 가능합니다:

```bash
# ClickStack (현재 설정)
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317

# Jaeger (직접 연결 시)
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4317

# Grafana Tempo
OTEL_EXPORTER_OTLP_ENDPOINT=http://tempo:4317

# Datadog (헤더 추가 필요)
OTEL_EXPORTER_OTLP_ENDPOINT=https://http-intake.logs.datadoghq.com:443
OTEL_EXPORTER_OTLP_HEADERS=DD-API-KEY=your-api-key
```

## 프로젝트 구조

```
clickstack-otel/
├── backend/                          # NestJS + Vanilla OpenTelemetry + Pino
│   ├── src/
│   │   ├── tracing.ts                # OpenTelemetry SDK 초기화 (gRPC)
│   │   ├── logger.ts                 # Pino 로거 클래스 (OTel 통합)
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── prisma-client.ts          # Prisma 클라이언트 (PostgreSQL)
│   │   ├── interceptors/
│   │   │   └── tracing.interceptor.ts        # 요청별 스팬 생성
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts      # 전역 에러 처리 + traceId
│   │   ├── shared/
│   │   │   ├── interfaces/task.interface.ts  # 공통 Task 인터페이스
│   │   │   └── metrics/
│   │   │       ├── database-tasks.metric.ts  # DB별 메트릭
│   │   │       └── tracing.interceptor.metric.ts # HTTP 메트릭
│   │   ├── tasks-in-memory/          # In-Memory 저장소
│   │   ├── tasks-mongo/              # MongoDB 저장소
│   │   ├── tasks-redis/              # Redis 저장소
│   │   └── tasks-postgres/           # PostgreSQL 저장소 (Prisma)
│   ├── prisma/
│   │   └── schema.prisma
│   ├── .env                          # 환경 변수
│   └── package.json
├── frontend/                         # React + Vite + HyperDX
│   ├── src/
│   │   ├── hyperdx.ts                # HyperDX SDK 초기화
│   │   ├── main.tsx
│   │   └── App.tsx
│   └── package.json
├── data/
│   └── otel-collector/
│       └── otel-collector-config.yaml  # Tail-based sampling 설정
├── docker-compose.yml                # App services (backend, frontend)
├── docker-compose.db.yml             # Infrastructure (ClickStack, DBs, Collector)
├── how-to-check-tail-sampling.md     # Tail sampling 검증 가이드
├── _explain-flow.md                  # 데이터 플로우 상세 설명
├── _explain-metrics.md               # 메트릭 상세 설명
└── README.md
```

## 빠른 시작

### 1. 인프라 실행 (ClickStack + Databases + OTEL Collector)

```bash
docker compose -f docker-compose.db.yml up -d
```

**실행되는 서비스:**
| 서비스 | 포트 | 설명 |
|--------|------|------|
| ClickStack (HyperDX) | 8080 | Observability UI |
| OTEL Collector | 4317, 4318 | Tail-based sampling |
| MongoDB | 27017 | Document DB |
| Redis | 6379 | Key-Value store |
| PostgreSQL | 5432 | Relational DB |

### 2. Backend 실행

```bash
cd backend
npm install
npx prisma generate   # Prisma 클라이언트 생성
npm run start:dev
```

### 3. Frontend 실행

```bash
cd frontend
npm install
npm run dev
```

### 4. 확인

| URL | 설명 |
|-----|------|
| http://localhost:8080 | HyperDX UI (ClickStack) |
| http://localhost:5173 | React Frontend |
| http://localhost:3000 | NestJS API |
| http://localhost:13133 | OTEL Collector Health |
| http://localhost:8888/metrics | OTEL Collector Metrics |

## Tail-Based Sampling

이 프로젝트는 **Tail-Based Sampling**을 사용하여 스토리지를 80-90% 절약하면서 중요한 트레이스는 100% 보존합니다.

### 샘플링 정책

| 정책 | 조건 | 샘플링 비율 |
|------|------|------------|
| **errors-policy** | `status_code = ERROR` | 100% |
| **latency-policy** | `duration > 2000ms` | 100% |
| **http-error-policy** | `http.status_code in [400, 500, 502, 503, 504]` | 100% |
| **probabilistic-policy** | 나머지 모든 트레이스 | 10% |

### Head-Based vs Tail-Based

```
Head-Based (SDK에서 결정):
  Request Start ──► "10% 확률로 샘플링 결정" ──► ... ──► Error! (놓침!)

Tail-Based (Collector에서 결정):
  Request Start ──► ... ──► Error! ──► Collector ──► "에러 있음 → 100% 보존!"
```

### 검증 방법

```bash
# Collector 상태 확인
curl http://localhost:13133/

# 샘플링 통계 확인
curl -s http://localhost:8888/metrics | grep "count_traces_sampled"

# 자세한 검증은 how-to-check-tail-sampling.md 참조
```

## OTLP 프로토콜

### gRPC vs HTTP

| 특성 | gRPC (4317) | HTTP (4318) |
|------|-------------|-------------|
| 프로토콜 | HTTP/2 + Protobuf | HTTP/1.1 + JSON |
| 성능 | 더 빠름 | 상대적으로 느림 |
| 브라우저 지원 | ❌ | ✅ |
| **이 프로젝트** | **Backend** | **Frontend** |

### NPM 패키지

```bash
# gRPC Exporters (Backend에서 사용)
@opentelemetry/exporter-trace-otlp-grpc
@opentelemetry/exporter-metrics-otlp-grpc
@opentelemetry/exporter-logs-otlp-grpc

# HTTP Exporters (브라우저 또는 방화벽 제한 환경용)
@opentelemetry/exporter-trace-otlp-http
@opentelemetry/exporter-metrics-otlp-http
@opentelemetry/exporter-logs-otlp-http
```

## API 엔드포인트

### In-Memory 저장소 (`/tasks/*`)

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/tasks` | 모든 태스크 조회 |
| GET | `/tasks/:id` | 특정 태스크 조회 |
| POST | `/tasks` | 태스크 생성 |
| PATCH | `/tasks/:id` | 태스크 수정 |
| DELETE | `/tasks/:id` | 태스크 삭제 |
| GET | `/tasks/slow` | 느린 작업 시뮬레이션 |
| GET | `/tasks/error` | 에러 시뮬레이션 |

### MongoDB 저장소 (`/mongo/tasks/*`)

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/mongo/tasks` | 모든 태스크 조회 |
| GET | `/mongo/tasks/:id` | 특정 태스크 조회 |
| POST | `/mongo/tasks` | 태스크 생성 |
| PATCH | `/mongo/tasks/:id` | 태스크 수정 |
| DELETE | `/mongo/tasks/:id` | 태스크 삭제 |

### Redis 저장소 (`/redis/tasks/*`)

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/redis/tasks` | 모든 태스크 조회 |
| GET | `/redis/tasks/:id` | 특정 태스크 조회 |
| POST | `/redis/tasks` | 태스크 생성 |
| PATCH | `/redis/tasks/:id` | 태스크 수정 |
| DELETE | `/redis/tasks/:id` | 태스크 삭제 |

### PostgreSQL 저장소 (`/postgres/tasks/*`)

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/postgres/tasks` | 모든 태스크 조회 |
| GET | `/postgres/tasks/:id` | 특정 태스크 조회 |
| POST | `/postgres/tasks` | 태스크 생성 |
| PATCH | `/postgres/tasks/:id` | 태스크 수정 |
| DELETE | `/postgres/tasks/:id` | 태스크 삭제 |

### 공통

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/health` | 헬스 체크 |

## 주요 코드 설명

### 1. OpenTelemetry SDK 초기화 (`tracing.ts`)

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc';

// gRPC는 URL 경로가 필요 없음 - 엔드포인트만 지정
const traceExporter = new OTLPTraceExporter({
  url: OTEL_EXPORTER_OTLP_ENDPOINT,  // http://otel-collector:4317
  headers,
});

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
  }),
  traceExporter,
  metricReader: new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 5_000,
  }),
  logRecordProcessors: [
    new BatchLogRecordProcessor(logExporter),
  ],
  instrumentations: [
    getNodeAutoInstrumentations(),
    new RuntimeNodeInstrumentation(),
    new PrismaInstrumentation(),
  ],
});
sdk.start();
```

### 2. Pino 로거 (`logger.ts`)

```typescript
import pino from 'pino';
import { trace, context } from '@opentelemetry/api';

// Trace context를 모든 로그에 자동 추가
function traceContextMixin(): object {
  const activeSpan = trace.getSpan(context.active());
  if (!activeSpan) return {};

  const spanContext = activeSpan.spanContext();
  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
  };
}

const rootLogger = pino({
  mixin: traceContextMixin,
});

// 사용 예시
this.logger.info({ taskId, title }, 'Task created');
// → 자동으로 traceId, spanId 포함!
```

### 3. 커스텀 메트릭

```typescript
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('tasks-service');

// Counter - 요청 수 카운팅
const counter = meter.createCounter('http.requests.total');
counter.add(1, { method: 'GET', route: '/tasks', status: 'success' });

// Histogram - 응답 시간 분포
const histogram = meter.createHistogram('db_tasks.operation.duration');
histogram.record(150, { database: 'mongodb', operation: 'create' });
```

### 4. 에러 응답 형식 (TraceId 포함)

모든 API 에러 응답에는 디버깅을 위한 `traceId`가 포함됩니다:

```json
{
  "statusCode": 500,
  "message": "Database connection failed",
  "error": "Internal Server Error",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "path": "/tasks/123",
  "traceId": "abc123def456789..."
}
```

> **Tip**: 사용자가 에러를 보고하면 `traceId`로 ClickStack에서 해당 요청의 전체 트레이스와 로그를 검색할 수 있습니다.

## 환경 변수

### Backend (`backend/.env`)

| 변수 | 기본값 | 설명 |
|-----|-------|------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://otel-collector:4317` | OTLP gRPC 엔드포인트 |
| `OTEL_EXPORTER_OTLP_HEADERS` | - | 인증 헤더 (선택) |
| `OTEL_SERVICE_NAME` | `clickstack-demo-backend` | 서비스 이름 |
| `SERVICE_VERSION` | `1.0.0` | 서비스 버전 |
| `NODE_ENV` | `development` | 환경 |
| `LOG_LEVEL` | `info` | Pino 로그 레벨 |
| `PORT` | `3000` | 서버 포트 |
| `MONGODB_URI` | `mongodb://mongodb:27017/clickstack` | MongoDB 연결 |
| `REDIS_HOST` | `redis` | Redis 호스트 |
| `POSTGRES_URL` | `postgresql://...` | PostgreSQL 연결 |

### Frontend (`frontend/.env`)

| 변수 | 기본값 | 설명 |
|-----|-------|------|
| `VITE_OTEL_ENDPOINT` | `http://localhost:4318` | OTLP HTTP 엔드포인트 |
| `VITE_SERVICE_NAME` | `clickstack-demo-frontend` | 서비스 이름 |
| `VITE_HYPERDX_API_KEY` | - | Session Replay API 키 |

## Docker Compose

### 인프라만 실행

```bash
docker compose -f docker-compose.db.yml up -d
```

### 앱 + 인프라 함께 실행

```bash
docker compose -f docker-compose.db.yml -f docker-compose.yml up -d
```

### 서비스 상태 확인

```bash
docker compose -f docker-compose.db.yml ps
```

## HyperDX UI에서 Observability 데이터 확인하기

HyperDX UI(`http://localhost:8080`)에 접속한 후, 각 Signal을 확인하는 방법입니다.

### Logs 확인

1. 좌측 사이드바에서 **"Search"** 클릭
2. 상단 드롭다운에서 **"Logs"** 선택
3. 검색창에서 필터링:
   - 전체 로그: 빈 검색
   - 서비스별: `service:clickstack-demo-backend`
   - 레벨별: `level:error`, `level:warn`

### Traces 확인

1. 좌측 사이드바에서 **"Search"** 클릭
2. 상단 드롭다운에서 **"Traces"** 선택
3. 검색 및 필터링:
   - 서비스별: `service:clickstack-demo-backend`
   - 에러만: `otel.status_code:ERROR`
   - 느린 요청: Duration 컬럼 기준 정렬

### Metrics 확인

1. 좌측 사이드바에서 **"Chart Explorer"** 클릭
2. 메트릭 선택:
   - `http.requests.total` - HTTP 요청 수
   - `db_tasks.operations.total` - DB 작업 수
   - `db_tasks.operation.duration` - DB 작업 소요 시간

### Session Replay 확인

1. 좌측 사이드바에서 **"Sessions"** 클릭
2. 세션 목록에서 원하는 세션 선택
3. 재생 버튼을 클릭하여 사용자의 브라우저 화면 녹화 확인

## 문서

| 문서 | 설명 |
|------|------|
| [_explain-flow.md](./_explain-flow.md) | 데이터 플로우 상세 설명 |
| [_explain-metrics.md](./_explain-metrics.md) | 메트릭 상세 설명 |
| [how-to-check-tail-sampling.md](./how-to-check-tail-sampling.md) | Tail sampling 검증 가이드 |

## 참고 자료

- [OpenTelemetry JS](https://opentelemetry.io/docs/instrumentation/js/)
- [OpenTelemetry Collector Tail Sampling](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/tailsamplingprocessor)
- [Pino Logger](https://github.com/pinojs/pino)
- [ClickStack Docs](https://clickhouse.com/docs/use-cases/observability/clickstack/overview)
- [HyperDX GitHub](https://github.com/hyperdxio/hyperdx)
