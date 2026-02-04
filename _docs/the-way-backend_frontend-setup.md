# Backend & Frontend Telemetry Setup Guide

> AWS EC2에서 OpenTelemetry Collector + ClickStack(HyperDX)을 구성하고,
> NestJS 백엔드와 Next.js 프론트엔드에서 텔레메트리를 전송하는 방법

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Users' Browsers (Public Internet)                              │
│  https://www.reviewdoctor.kr                                    │
└─────────────────────┬───────────────────────────────────────────┘
                      │ HyperDX Browser SDK
                      │ (traces, logs, session replay)
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  EC2 (3.38.182.36)                                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ OTel Collector :4318 (HTTP + CORS)                       │  │
│  │                 :4317 (gRPC, VPC only)                    │  │
│  └─────────────────────┬────────────────────────────────────┘  │
│                        ▼                                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ ClickStack (HyperDX) :8080                               │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                      ▲
                      │ gRPC :4317 (VPC internal)
┌─────────────────────┴───────────────────────────────────────────┐
│  NestJS Backend (Same VPC)                                      │
│  172.31.x.x                                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## EC2 Configuration

- **Public IP**: 3.38.182.36
- **Private IP**: 172.31.88.186

### Security Group Rules

| Port | Protocol | Source | Description |
|------|----------|--------|-------------|
| 4317 | TCP | 172.31.0.0/16 | OTLP gRPC from VPC (Backend) |
| 4318 | TCP | 0.0.0.0/0 | OTLP HTTP from browser clients |
| 8080 | TCP | (Admin IP)/32 | HyperDX Web UI access |

> ⚠️ **Security Note**: Opening 4318 to 0.0.0.0/0 allows anyone to send telemetry. Consider using ALB with WAF for production.

---

## EC2 Setup

### 1. docker-compose.monitoring.yml

HyperDX URL 환경변수 활성화:

```yaml
clickstack:
  image: docker.hyperdx.io/hyperdx/hyperdx-all-in-one
  environment:
    HYPERDX_APP_URL: http://3.38.182.36
    FRONTEND_URL: http://3.38.182.36:8080
  # ... rest of config
```

### 2. otel-collector-config.yaml

CORS 설정 (프론트엔드 도메인 허용):

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
        cors:
          allowed_origins:
            - "https://www.reviewdoctor.kr"
            - "https://reviewdoctor.kr"
          allowed_headers:
            - "*"
          max_age: 7200
```

### 3. Deploy Commands

```bash
# EC2에서 실행
cd /path/to/clickstack-otel

# Docker Compose 실행
docker compose -f docker-compose.monitoring.yml up -d

# Health check 확인
curl http://localhost:13133/  # OTel Collector
curl http://localhost:8080/   # HyperDX UI

# 로그 확인
docker compose -f docker-compose.monitoring.yml logs -f
```

---

## Backend Setup (NestJS)

### 1. Install Dependencies

```bash
npm install @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-grpc \
  @opentelemetry/exporter-metrics-otlp-grpc \
  @opentelemetry/exporter-logs-otlp-grpc
```

### 2. Create tracing.ts

```typescript
// src/tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

const collectorUrl = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'grpc://172.31.88.186:4317';

const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME || 'nestjs-backend',
  traceExporter: new OTLPTraceExporter({
    url: collectorUrl,
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: collectorUrl,
    }),
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('Tracing terminated'))
    .catch((error) => console.log('Error terminating tracing', error))
    .finally(() => process.exit(0));
});
```

### 3. Update main.ts

```typescript
// src/main.ts
import './tracing';  // 가장 먼저 import!

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();
```

### 4. Environment Variables

```bash
# .env or docker-compose environment
OTEL_EXPORTER_OTLP_ENDPOINT=grpc://172.31.88.186:4317
OTEL_SERVICE_NAME=reviewdoctor-backend
```

> 💡 **Tip**: Use EC2 **Private IP** (172.31.88.186) for backend since it's in the same VPC.

---

## Frontend Setup (Next.js)

### 1. Install HyperDX Browser SDK

```bash
npm install @hyperdx/browser
```

### 2. Create HyperDX Init Component

```typescript
// components/HyperDXInit.tsx
"use client";

import { useEffect } from "react";
import HyperDX from "@hyperdx/browser";

export default function HyperDXInit() {
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_HYPERDX_API_KEY;
    const otelEndpoint = process.env.NEXT_PUBLIC_OTEL_ENDPOINT;
    const serviceName = process.env.NEXT_PUBLIC_SERVICE_NAME!;

    if (apiKey && otelEndpoint) {
      HyperDX.init({
        url: otelEndpoint,
        apiKey,
        service: serviceName,
        tracePropagationTargets: [/reviewdoctor\.kr/i],
        consoleCapture: false,
        advancedNetworkCapture: false,
      });
    }
  }, []);

  return null;
}
```

### 3. Add to Root Layout

```typescript
// app/layout.tsx
import HyperDXInit from '@/components/HyperDXInit';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <HyperDXInit />
        {children}
      </body>
    </html>
  );
}
```

### 4. Environment Variables

```bash
# .env.production
NEXT_PUBLIC_HYPERDX_API_KEY=6adecf01-7114-47a8-b1fe-bf0a9516a97d
NEXT_PUBLIC_OTEL_ENDPOINT=http://3.38.182.36:4318
NEXT_PUBLIC_SERVICE_NAME=reviewdoctor-frontend
```

---

## Production HTTPS Setup (Required)

### Problem: Mixed Content

HTTPS 사이트(https://www.reviewdoctor.kr)에서 HTTP 엔드포인트(http://3.38.182.36:4318)로 요청하면 브라우저가 차단합니다.

### Solution Options

| Option | Complexity | Description |
|--------|------------|-------------|
| **A. ALB + ACM** | Medium | ALB에서 HTTPS 종료, 4318으로 포워딩 |
| **B. CloudFront** | Medium | CloudFront → EC2 origin |
| **C. Nginx + Let's Encrypt** | Low | EC2에 Nginx 추가, certbot으로 인증서 |

### Option C: Nginx + Let's Encrypt (Recommended for simplicity)

#### 1. Add Nginx to docker-compose

```yaml
# docker-compose.monitoring.yml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on:
      - otel-collector
    networks:
      - sample
```

#### 2. Create nginx.conf

```nginx
events {
    worker_connections 1024;
}

http {
    server {
        listen 443 ssl;
        server_name otel.reviewdoctor.kr;

        ssl_certificate /etc/letsencrypt/live/otel.reviewdoctor.kr/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/otel.reviewdoctor.kr/privkey.pem;

        location / {
            proxy_pass http://otel-collector:4318;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

#### 3. Setup SSL Certificate

```bash
# EC2에서 실행
sudo apt install certbot
sudo certbot certonly --standalone -d otel.reviewdoctor.kr
```

#### 4. Update DNS

Route53 또는 DNS 제공자에서:
```
otel.reviewdoctor.kr → 3.38.182.36 (A Record)
```

#### 5. Update Frontend Environment

```bash
# .env.production
NEXT_PUBLIC_OTEL_ENDPOINT=https://otel.reviewdoctor.kr
```

---

## Verification Checklist

| Step | Command/URL | Expected Result |
|------|-------------|-----------------|
| Collector Health | `curl http://172.31.88.186:13133/` | 200 OK |
| HyperDX UI | `http://3.38.182.36:8080` (from admin IP) | Login screen |
| NestJS → Collector | Check NestJS logs | OTLP export success |
| Frontend → Collector | Browser DevTools Network tab | 200 on /v1/traces |
| View Traces | HyperDX UI → Search | Traces displayed |

---

## Troubleshooting

### CORS Errors in Browser

```
Access to XMLHttpRequest at 'http://...' from origin 'https://...' has been blocked by CORS policy
```

**Solution**: Check `otel-collector-config.yaml` CORS settings match your domain exactly.

### Mixed Content Blocked

```
Mixed Content: The page was loaded over HTTPS, but requested an insecure resource
```

**Solution**: Setup HTTPS for OTel Collector endpoint (see Production HTTPS Setup section).

### Connection Refused from Backend

```
Error: connect ECONNREFUSED 172.31.88.186:4317
```

**Solution**:
1. Check security group allows 4317 from your VPC CIDR
2. Verify OTel Collector is running: `docker ps`
3. Check collector logs: `docker logs otel-collector`

### No Traces in HyperDX

1. Check collector logs for errors
2. Verify API key matches in frontend and ClickStack
3. Check browser console for network errors
4. Ensure `tracePropagationTargets` regex matches your API domain

---

## Key Insights

1. **Private IP for Backend** — Same VPC 통신은 private IP 사용. 보안 그룹 규칙 적용 + 네트워크 비용 절감.

2. **CORS for Browser Only** — 서버간 통신(NestJS→Collector)은 CORS 불필요. 브라우저 보안 메커니즘.

3. **gRPC for Backend, HTTP for Frontend** — 백엔드는 gRPC(4317)가 효율적. 브라우저는 HTTP(4318)만 지원.

4. **tracePropagationTargets** — 이 설정으로 프론트엔드↔백엔드 트레이스가 연결됨. Distributed tracing의 핵심.

5. **HTTPS is Required for Production** — Mixed Content 정책으로 HTTPS 사이트에서 HTTP 요청은 차단됨.
