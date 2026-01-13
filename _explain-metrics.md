# Difference Between `http.server.duration` and `http.client.duration`

These are two distinct OpenTelemetry semantic convention metrics that measure HTTP request latency from different perspectives:

## `http.server.duration`

**Perspective**: The **receiving** service (your application as a server)

**What it measures**: Time elapsed from when your server receives an incoming HTTP request to when it sends the response back to the caller.

```
[External Client] ──request──> [Your Server]
                                    │
                         ┌──────────┴──────────┐
                         │  http.server.duration │
                         │  (processing time)    │
                         └──────────┬──────────┘
                                    │
[External Client] <──response── [Your Server]
```

**Typical attributes**:
- `http.request.method` (GET, POST, etc.)
- `http.response.status_code`
- `http.route` (e.g., `/users/{id}`)
- `url.scheme` (http/https)

---

## `http.client.duration`

**Perspective**: The **calling** service (your application as a client)

**What it measures**: Time elapsed from when your application initiates an outgoing HTTP request to an external service until it receives the response.

```
[Your App] ──request──> [External Service/API]
    │
    │  ┌────────────────────────┐
    │  │  http.client.duration  │
    │  │  (round-trip time)     │
    │  └────────────────────────┘
    │
[Your App] <──response── [External Service/API]
```

**Typical attributes**:
- `http.request.method`
- `http.response.status_code`
- `server.address` (target host)
- `server.port`

---

## Key Differences Summary

| Aspect | `http.server.duration` | `http.client.duration` |
|--------|------------------------|------------------------|
| **Role** | You are the server | You are the client |
| **Measures** | Incoming request processing | Outgoing request round-trip |
| **Includes** | Your app's processing time | Network latency + remote processing |
| **Use case** | Monitor your API performance | Monitor dependency latency |

---

## Practical Insights

1. **Debugging slow requests**: If `http.server.duration` is high but your code is fast, check `http.client.duration` for slow downstream calls
2. **Service mesh visibility**: In microservices, one service's `http.client.duration` often correlates with another service's `http.server.duration` (minus network overhead)
3. **SLO definitions**: Server duration is typically used for your SLOs; client duration helps identify which dependencies violate *their* SLOs
