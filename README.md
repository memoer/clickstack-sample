# 🔭 ClickStack Demo (Vendor-neutral OpenTelemetry)

NestJS + React (Vite) + **Vanilla OpenTelemetry** + **Pino** 데모 프로젝트

> ⚠️ **이 프로젝트는 벤더 중립적입니다!**  
> OTLP 엔드포인트만 변경하면 어떤 observability 백엔드로도 전환 가능합니다.

## 요구 사항

- **Node.js**: v20.0.0 이상 (v24.x 권장)
- **npm**: v10 이상

## ✅ 지원하는 Observability Signals

| Signal | Backend | Frontend | 구현 방식 |
|--------|---------|----------|----------|
| 📝 **Logs** | ✅ | ✅ | Backend: Pino → OTLP / Frontend: Console capture → OTLP |
| 📊 **Metrics** | ✅ | ✅ | OpenTelemetry Metrics API + Web Vitals (CLS, INP, LCP, TTFB, FCP) |
| 🔍 **Traces** | ✅ | ✅ | Auto-instrumentation + 커스텀 스팬 |
| 🎬 **Session Replay** | - | ✅ | HyperDX Browser SDK (vendor-specific, 표준 없음) |

> **Note**: Session Replay는 현재 표준화된 OpenTelemetry 스펙이 없어 HyperDX SDK를 사용합니다.
> 다른 벤더로 전환 시 해당 벤더의 Session Replay SDK로 교체 필요.

## 🔄 벤더 중립성 (Vendor-neutral)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Your Application                              │
│                                                                  │
│    ┌─────────────────────────────────────────────────────┐      │
│    │    Vanilla OpenTelemetry SDK + Pino                 │      │
│    │    (벤더 종속성 없음!)                               │      │
│    └─────────────────────────┬───────────────────────────┘      │
└──────────────────────────────┼──────────────────────────────────┘
                               │
                               │ OTLP (표준 프로토콜)
                               ▼
              ┌────────────────────────────────────┐
              │    OTLP Endpoint 변경만으로 전환!   │
              └────────────────────────────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         ▼                     ▼                     ▼
   ┌──────────┐          ┌──────────┐          ┌──────────┐
   │ClickStack│          │  Jaeger  │          │ Datadog  │
   │ (HyperDX)│          │  Tempo   │          │ New Relic│
   └──────────┘          │  Zipkin  │          │ Honeycomb│
                         └──────────┘          └──────────┘
```

### 백엔드 전환 방법

환경변수만 변경하면 됩니다:

```bash
# ClickStack (HyperDX)
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

# Jaeger
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318

# Grafana Tempo
OTEL_EXPORTER_OTLP_ENDPOINT=http://tempo:4318

# Datadog (헤더 추가 필요)
OTEL_EXPORTER_OTLP_ENDPOINT=https://http-intake.logs.datadoghq.com
OTEL_EXPORTER_OTLP_HEADERS=DD-API-KEY=your-api-key
```

## 프로젝트 구조

```
clickstack-otel/
├── backend/                 # NestJS + Vanilla OpenTelemetry + Pino
│   ├── src/
│   │   ├── tracing.ts      # OpenTelemetry SDK 초기화 (벤더 중립)
│   │   ├── logger.ts       # Pino 로거 (OTel 통합)
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   └── tasks/          # Tasks CRUD (메트릭 + 트레이스 + 로그)
│   └── package.json
├── frontend/               # React + Vite
│   └── ...
├── docker-compose.yml
└── README.md
```

## 빠른 시작

### 1. ClickStack 실행 (Docker)

```bash
docker run -p 8080:8080 -p 4317:4317 -p 4318:4318 docker.hyperdx.io/hyperdx/hyperdx-all-in-one
```

포트:
- `8080`: HyperDX UI
- `4317`: OTLP gRPC
- `4318`: OTLP HTTP

### 2. Backend 실행

```bash
cd backend
npm install
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

## API 엔드포인트

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/tasks` | 모든 태스크 조회 |
| GET | `/tasks/:id` | 특정 태스크 조회 |
| POST | `/tasks` | 태스크 생성 |
| PUT | `/tasks/:id` | 태스크 수정 |
| DELETE | `/tasks/:id` | 태스크 삭제 |
| GET | `/tasks/slow` | 느린 작업 시뮬레이션 |
| GET | `/tasks/error` | 에러 시뮬레이션 |
| GET | `/health` | 헬스 체크 |

## 주요 코드 설명

### 1. Pino 로거 (`logger.ts`)

```typescript
import pino from 'pino';
import { trace, context } from '@opentelemetry/api';

// Trace context를 모든 로그에 자동 추가
function traceContextMixin() {
  const activeSpan = trace.getSpan(context.active());
  if (!activeSpan) return {};
  
  const spanContext = activeSpan.spanContext();
  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
  };
}

export const logger = pino({
  mixin: traceContextMixin,  // 모든 로그에 traceId, spanId 포함!
});
```

### 2. 로그 사용 예시

```typescript
import { logger } from '../logger';

// 로그에 자동으로 traceId, spanId가 포함됨!
logger.info({ taskId: id, title }, 'Task created');
logger.warn({ taskId: id }, 'Task not found');
logger.error({ err: error }, 'Operation failed');
```

### 3. 로그 출력 예시

```json
{
  "level": "info",
  "time": "2024-01-15T10:30:00.000Z",
  "msg": "Task created",
  "taskId": "task-123",
  "title": "Learn ClickStack",
  "traceId": "abc123def456...",
  "spanId": "789xyz...",
  "service": "clickstack-demo-backend"
}
```

### 4. 커스텀 메트릭

```typescript
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('tasks-service');

// Counter
const counter = meter.createCounter('tasks.operations.total');
counter.add(1, { operation: 'create', status: 'success' });

// Histogram
const histogram = meter.createHistogram('tasks.operation.duration');
histogram.record(150, { operation: 'create' });

// UpDownCounter
const gauge = meter.createUpDownCounter('tasks.active.count');
gauge.add(1);   // 생성
gauge.add(-1);  // 삭제
```

### 5. 커스텀 트레이스

```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('tasks-service');

async function createTask(data) {
  return tracer.startActiveSpan('tasks.create', async (span) => {
    try {
      span.setAttribute('task.title', data.title);
      
      // 비즈니스 로직...
      
      span.setStatus({ code: SpanStatusCode.OK });
      return task;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}
```

## 환경 변수

### Backend

| 변수 | 기본값 | 설명 |
|-----|-------|------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | OTLP 엔드포인트 |
| `OTEL_EXPORTER_OTLP_HEADERS` | - | 인증 헤더 (선택) |
| `OTEL_SERVICE_NAME` | `clickstack-demo-backend` | 서비스 이름 |
| `SERVICE_VERSION` | `1.0.0` | 서비스 버전 |
| `NODE_ENV` | `development` | 환경 |
| `LOG_LEVEL` | `info` (prod) / `debug` (dev) | Pino 로그 레벨 |
| `PORT` | `3000` | 서버 포트 |

### Frontend

| 변수 | 기본값 | 설명 |
|-----|-------|------|
| `VITE_OTEL_ENDPOINT` | `http://localhost:4318` | OTLP 엔드포인트 |
| `VITE_SERVICE_NAME` | `clickstack-demo-frontend` | 서비스 이름 |
| `VITE_SERVICE_VERSION` | `1.0.0` | 서비스 버전 |
| `VITE_OTEL_API_KEY` | - | OTLP 인증 API 키 |
| `VITE_HYPERDX_API_KEY` | (VITE_OTEL_API_KEY) | Session Replay API 키 |

## Docker Compose로 전체 실행

```bash
docker-compose up -d
```

## 🖥️ HyperDX UI에서 Observability 데이터 확인하기

HyperDX UI(`http://localhost:8080`)에 접속한 후, 각 Signal을 확인하는 방법입니다.

### 📝 Logs 확인

1. 좌측 사이드바에서 **"Search"** 클릭
2. 상단 드롭다운에서 **"Logs"** 선택
3. 검색창에서 필터링:
   - 전체 로그: 빈 검색
   - 서비스별: `service:clickstack-demo-backend`
   - 레벨별: `level:error`, `level:warn`
   - 특정 메시지: `"Task created"`, `"Task not found"`

> 💡 **Tip**: 로그를 클릭하면 해당 로그와 연결된 Trace로 바로 이동할 수 있습니다 (traceId 링크)

### 🔍 Traces 확인

1. 좌측 사이드바에서 **"Search"** 클릭
2. 상단 드롭다운에서 **"Traces"** 선택
3. 검색 및 필터링:
   - 전체 트레이스: 빈 검색
   - 서비스별: `service:clickstack-demo-backend`
   - 엔드포인트별: `http.target:/tasks`
   - 에러만: `otel.status_code:ERROR`
   - 느린 요청: Duration 컬럼 기준 정렬
4. 트레이스 클릭 → **Waterfall View**에서 스팬 계층 구조 확인

> 💡 **Tip**: 느린 API 호출을 찾으려면 `GET /tasks/slow` 엔드포인트를 호출해보세요

### 📊 Metrics 확인

1. 좌측 사이드바에서 **"Chart Explorer"** 클릭
2. 메트릭 선택:
   - `tasks.operations.total` - 작업 수 (Counter)
   - `tasks.operation.duration` - 작업 소요 시간 (Histogram)
   - `tasks.active.count` - 활성 태스크 수 (UpDownCounter)
3. Group by 설정:
   - `operation`: create, read, update, delete 별 분류
   - `status`: success, error 별 분류
4. **"Add to Dashboard"**로 대시보드에 추가 가능

### 🎬 Session Replay 확인

1. 좌측 사이드바에서 **"Sessions"** 클릭
2. 세션 목록에서 원하는 세션 선택
3. **재생 버튼**을 클릭하여 사용자의 브라우저 화면 녹화 확인
4. 타임라인에서 특정 시점으로 이동 가능
5. 세션 내에서 발생한 **Console Logs**, **Network Requests**, **Errors** 확인

> 💡 **Tip**: Frontend에서 에러가 발생하면 해당 시점의 화면과 함께 에러 컨텍스트를 확인할 수 있습니다

### 🔗 Signal 간 연결 (Correlation)

HyperDX의 강력한 기능 중 하나는 모든 Signal이 연결되어 있다는 것입니다:

```text
Session Replay → Frontend Error → Backend Trace → Related Logs
       ↓              ↓                ↓              ↓
   사용자 화면     JS 에러 발생     API 호출 추적    상세 로그
```

- **Trace → Logs**: 트레이스 상세 보기에서 "Logs" 탭 클릭
- **Log → Trace**: 로그의 `traceId` 클릭
- **Session → Traces**: 세션 내 Network 탭에서 요청 클릭
- **Error → Session**: 에러 발생 시점의 세션 재생 확인

## 참고 자료

- [OpenTelemetry JS](https://opentelemetry.io/docs/instrumentation/js/)
- [Pino Logger](https://github.com/pinojs/pino)
- [ClickStack Docs](https://clickhouse.com/docs/use-cases/observability/clickstack/overview)
