/**
 * HyperDX 미사용 기능 예시
 *
 * 이 파일은 참고용 예시 코드입니다.
 * 실제 앱에 통합하려면 필요한 부분을 복사해서 사용하세요.
 */

import HyperDX from "@hyperdx/browser";

// ============================================================
// 1. setGlobalAttributes - 전역 속성 설정
// ============================================================
// 모든 트레이스/로그에 자동으로 포함되는 속성을 설정합니다.
// 사용자 식별, 환경 정보 등에 유용합니다.

export function setGlobalAttrs(userId: number) {
  HyperDX.setGlobalAttributes({
    userId: userId.toString(),
  });
}

export function clearGlobalAttrs() {
  HyperDX.setGlobalAttributes({});
}

// ============================================================
// 2. attachSession - 세션 연결
// ============================================================
// 프론트엔드 세션을 백엔드 요청과 연결합니다.
// 백엔드에서 이 세션 ID로 프론트엔드 세션 리플레이를 찾을 수 있습니다.

export function exampleAttachSessionToRequest(): HeadersInit {
  const headers: Record<string, any> = {};

  // fetch 요청에 세션 ID 헤더 추가
  const sessionId = HyperDX.getSessionId();
  if (sessionId) {
    headers["x-hyperdx-session-id"] = sessionId;
  }

  // 세션 URL 가져오기 (디버깅/로깅용)
  // ClickStack UI에서 이 URL로 세션 리플레이 바로 접근 가능
  const sessionUrl = HyperDX.getSessionUrl();
  if (sessionUrl) {
    headers["x-hyperdx-session-url"] = sessionUrl;
  }

  return headers;
}

// ============================================================
// 3. enableAdvancedNetworkCapture - 네트워크 상세 캡처
// ============================================================
// init에서 설정 가능하지만, 런타임에도 토글 가능합니다.

export function exampleToggleNetworkCapture(enable: boolean) {
  // 민감한 페이지에서는 끄고, 디버깅 시에는 켜기
  if (enable) {
    HyperDX.enableAdvancedNetworkCapture();
  } else {
    HyperDX.disableAdvancedNetworkCapture();
  }
}

// ============================================================
// 4. addAction, recordException
// ============================================================

export function exampleStructuredActions() {
  // 페이지 뷰 추적
  HyperDX.addAction("page_view", {
    page: "/dashboard",
    referrer: document.referrer,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  });

  // 사용자 행동 추적
  HyperDX.addAction("user_interaction", {
    element: "submit_button",
    form: "task_create",
    timeOnPage: Math.floor(performance.now() / 1000),
  });
}

export function exampleRichErrorRecording(error: Error) {
  HyperDX.recordException(error, {
    // 앱 상태
    currentRoute: window.location.pathname,
    userAgent: navigator.userAgent,

    // 추가 디버깅 정보
    timestamp: new Date().toISOString(),
    sessionDuration: Math.floor(performance.now() / 1000),
  });
}

// ============================================================
// 5. Custom Span (OTEL API 직접 사용)
// ============================================================
// HyperDX는 OTEL 기반이므로 OTEL API도 함께 사용 가능합니다.

import { trace, SpanStatusCode } from "@opentelemetry/api";

export async function wrapForTrace<T>(
  operationName: string,
  fn: () => Promise<T>
): Promise<T> {
  const tracer = trace.getTracer("frontend-app");

  return tracer.startActiveSpan(operationName, async span => {
    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : "Unknown error",
      });
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  });
}

// 사용 예시
export async function exampleUseCustomSpan() {
  const result = await wrapForTrace("complex_calculation", async () => {
    // 무거운 작업 수행
    await new Promise(resolve => setTimeout(resolve, 100));
    return { calculated: true };
  });
  return result;
}

// ============================================================
// 통합 예시: 인증 플로우
// ============================================================

export async function exampleLoginFlow(email: string, password: string) {
  // 1. 로그인 시도 기록
  HyperDX.addAction("login_attempt", { email });

  try {
    // 2. 커스텀 스팬으로 API 호출 추적
    const user = await wrapForTrace("login_api_call", async () => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: exampleAttachSessionToRequest(),
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw new Error("Login failed");
      return res.json();
    });

    // 3. 로그인 성공 - 전역 속성 설정
    HyperDX.setGlobalAttributes({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
    });

    // 4. 성공 액션 기록
    HyperDX.addAction("login_success", { userId: user.id });

    return user;
  } catch (error) {
    // 5. 실패 시 상세 에러 기록
    HyperDX.recordException(error as Error, {
      action: "login",
      email,
      errorType: "authentication_failed",
    });
    throw error;
  }
}
