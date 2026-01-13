# 대시보드 구축

clickstack을 이용하여 모니터링을 하기 위해 대시보드를 구축하세요.
만들어야 할 대시보드를 참고하여, 해당 내용에 담겨져있는 관심사항들만 대시보드를 구축해주세요.


## 만들어야 할 대시보드

### nodejs

- Node js의 대표적인 런타임 영역 관련 지표를 알고 싶다 (for performance)
- @_available-metrics.md를 참고하여 Node.js Runtime 영역 Metric을 모두 사용하여 대시보드를 만들어주세요.

## 현재 사용 중인 모니터링 툴

### 실행중인 APM, DB, Server, Frontend

1. @docker-compose.db.yml
   - clickstack
     - localhost:8080   # HyperDX UI
     - localhost:4317   # OTLP gRPC
     - localhost:4318   # OTLP HTTP
     - localhost:9000   # ClickHouse native port
   - mongodb
     - localhost:27017
   - redis
     - localhost:6379
   - postgres
     - localhost:5432
2. @docker-compose.yml
   - backend
     - localhost:3000
   - frontend
     - localhost:5173

### 웹 링크와 도커 이미지

- [clickStack](https://clickhouse.com/use-cases/observability)을 사용할 예정
- 도커 이미지는 `docker.hyperdx.io/hyperdx/hyperdx-all-in-one`를 사용중

## 참고

- 활성화된 MCP를 적극 사용해주세요.
- 진행한 내용들을 step 별로 building-dashboard-step.md에 요약하여 추가해주세요.
- import/export을 위한 dashboard json 샘플 데이터를 보고 싶다면, @dashboard-sample.json을 참고하세요.