/**
 * @lucky/api-client — web/mobile 공통 fetch 래퍼.
 *
 * 설계 원칙 (frontend/mobile/PROGRESS.md 결정 #API1~#API3):
 *   - 얇게: fetch + 401 자동 refresh + 토큰 저장소 주입형. 도메인 함수는 포함하지 않음.
 *   - 비동기 토큰 저장소: SecureStore/Keychain 대응 위해 모든 IO 가 Promise.
 *   - 단일 인플라이트 refresh: 동시 401 다수일 때 refresh 1회만.
 *
 * 클라이언트 모드별 동작:
 *   - web: refresh 는 HttpOnly 쿠키. fetch credentials='include'. body 의 refreshToken 무시.
 *   - mobile: 모든 요청에 X-Client: mobile 헤더. refresh 는 body 의 refreshToken 으로. credentials='omit'.
 */

// ─── 타입 ──────────────────────────────────────────────────────────────────

export type ClientMode = 'web' | 'mobile';

export interface TokenStore {
  getAccess(): Promise<string | null>;
  setAccess(token: string | null): Promise<void>;
  /** 모바일 전용. 웹은 쿠키로 처리되므로 항상 null 반환/no-op 구현해도 됨. */
  getRefresh(): Promise<string | null>;
  setRefresh(token: string | null): Promise<void>;
  clear(): Promise<void>;
}

export interface ApiClientOptions {
  /** 모바일이면 절대 URL(예: https://api.lucky.example), 웹이면 빈 문자열(same-origin). */
  baseUrl?: string;
  mode: ClientMode;
  store: TokenStore;
  /** refresh 엔드포인트 (예: '/api/auth/refresh' 또는 '/api/admin/auth/refresh'). */
  refreshPath: string;
  /**
   * 401 자동 refresh 를 건너뛸 경로 prefix (예: '/api/auth/').
   * 로그인/회원가입/refresh 자체는 refresh 재시도 대상이 아님.
   */
  authPathPrefix: string;
  /** refresh 실패(또는 401 후 refresh 도 실패) 시 호출. 예: 로그인 페이지로 redirect. */
  onUnauthorized?: () => void;
}

export interface ApiCallInit extends RequestInit {
  idempotencyKey?: string;
}

export interface ApiClient {
  fetch<T = unknown>(path: string, init?: ApiCallInit): Promise<T>;
  /** 외부에서 access token 을 직접 주입할 때(예: 로그인 응답을 받았을 때). */
  setAccessToken(token: string | null): Promise<void>;
  clearTokens(): Promise<void>;
}

// ─── 에러 ──────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  public rawMessage: string;

  constructor(
    public status: number,
    public code: string,
    message: string,
    rawMessage: string = message,
  ) {
    super(toKoreanApiErrorMessage(message, status));
    this.name = 'ApiError';
    this.rawMessage = rawMessage;
  }
}

// ─── 클라이언트 ────────────────────────────────────────────────────────────

export function createApiClient(opts: ApiClientOptions): ApiClient {
  const baseUrl = opts.baseUrl ?? '';
  let inflight: Promise<string | null> | null = null;

  /** 단일 인플라이트 refresh — 동시 401 여러 건이 와도 refresh 는 1회만 실행. */
  async function refreshAccess(): Promise<string | null> {
    if (inflight) return inflight;
    inflight = doRefresh().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  async function doRefresh(): Promise<string | null> {
    try {
      const headers = new Headers({ 'Content-Type': 'application/json' });
      let body: string | undefined;
      if (opts.mode === 'mobile') {
        headers.set('X-Client', 'mobile');
        const refresh = await opts.store.getRefresh();
        if (!refresh) {
          await opts.store.clear();
          opts.onUnauthorized?.();
          return null;
        }
        body = JSON.stringify({ refreshToken: refresh });
      }
      const res = await fetch(baseUrl + opts.refreshPath, {
        method: 'POST',
        headers,
        body,
        credentials: opts.mode === 'web' ? 'include' : 'omit',
      });
      if (!res.ok) {
        await opts.store.clear();
        opts.onUnauthorized?.();
        return null;
      }
      const data = (await res.json()) as {
        accessToken?: string;
        refreshToken?: string;
      };
      if (data.accessToken) await opts.store.setAccess(data.accessToken);
      if (data.refreshToken) await opts.store.setRefresh(data.refreshToken);
      return data.accessToken ?? null;
    } catch {
      await opts.store.clear();
      opts.onUnauthorized?.();
      return null;
    }
  }

  async function rawFetch(
    url: string,
    init: RequestInit,
    token: string | null,
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (opts.mode === 'mobile') headers.set('X-Client', 'mobile');
    return fetch(url, {
      ...init,
      headers,
      credentials: opts.mode === 'web' ? 'include' : 'omit',
    });
  }

  async function call<T>(path: string, init: ApiCallInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    if (init.idempotencyKey) headers.set('Idempotency-Key', init.idempotencyKey);

    const url = baseUrl + (path.startsWith('/') ? path : `/${path}`);
    const skipRefresh = path.startsWith(opts.authPathPrefix);

    const token = await opts.store.getAccess();
    let res = await rawFetch(url, { ...init, headers }, token);

    if (res.status === 401 && !skipRefresh) {
      const refreshed = await refreshAccess();
      if (refreshed) {
        res = await rawFetch(url, { ...init, headers }, refreshed);
      }
    }

    const text = await res.text();
    const body: unknown = text ? safeJson(text) : null;

    if (!res.ok) {
      const message =
        (isObj(body) && 'message' in body
          ? String((body as { message: unknown }).message)
          : res.statusText) || 'request failed';
      const code =
        isObj(body) && 'error' in body
          ? String((body as { error: unknown }).error)
          : String(res.status);
      throw new ApiError(res.status, code, message);
    }

    // login/refresh 응답의 토큰 자동 저장 (web/mobile 양쪽).
    if (isObj(body)) {
      const at = (body as { accessToken?: unknown }).accessToken;
      const rt = (body as { refreshToken?: unknown }).refreshToken;
      if (typeof at === 'string') await opts.store.setAccess(at);
      if (typeof rt === 'string' && opts.mode === 'mobile') {
        await opts.store.setRefresh(rt);
      }
    }

    return body as T;
  }

  return {
    fetch: call,
    setAccessToken: (t) => opts.store.setAccess(t),
    clearTokens: () => opts.store.clear(),
  };
}

// ─── 토큰 저장소 어댑터 (web 용) ───────────────────────────────────────────

/**
 * sessionStorage 기반 저장소. 웹 전용.
 * SSR 환경(window 미정의)에서는 no-op 처리.
 * 웹은 refresh 를 쿠키로 관리하므로 getRefresh/setRefresh 는 no-op.
 */
export function createSessionStorageStore(accessKey: string): TokenStore {
  return {
    async getAccess() {
      if (typeof window === 'undefined') return null;
      return sessionStorage.getItem(accessKey);
    },
    async setAccess(token) {
      if (typeof window === 'undefined') return;
      if (token) sessionStorage.setItem(accessKey, token);
      else sessionStorage.removeItem(accessKey);
    },
    async getRefresh() {
      return null;
    },
    async setRefresh() {
      // 웹: refresh 는 HttpOnly 쿠키로 관리됨 → no-op.
    },
    async clear() {
      if (typeof window === 'undefined') return;
      sessionStorage.removeItem(accessKey);
    },
  };
}

/** 메모리 저장소 — 테스트나 SSR 안전 fallback 으로 사용. */
export function createMemoryStore(): TokenStore {
  let access: string | null = null;
  let refresh: string | null = null;
  return {
    async getAccess() {
      return access;
    },
    async setAccess(t) {
      access = t;
    },
    async getRefresh() {
      return refresh;
    },
    async setRefresh(t) {
      refresh = t;
    },
    async clear() {
      access = null;
      refresh = null;
    },
  };
}

// ─── 유틸 ──────────────────────────────────────────────────────────────────

export function newIdempotencyKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export function toKoreanApiErrorMessage(message: unknown, status?: number): string {
  const source = Array.isArray(message) ? message.join(', ') : String(message || '');
  const raw = source.trim();
  const lower = raw.toLowerCase();

  if (!raw) return fallbackKoreanMessage(status);
  if (/[가-힣]/.test(raw)) return raw;

  if (status === 401) return '로그인이 필요하거나 인증 정보가 올바르지 않습니다.';
  if (status === 403) return '이 작업을 수행할 권한이 없습니다.';
  if (status === 404) return '요청한 정보를 찾을 수 없습니다.';
  if (status === 409 && lower.includes('already')) return '이미 처리되었거나 중복된 요청입니다.';
  if (status === 429) return '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  if (status && status >= 500) return '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';

  if (lower.includes('birthdate')) return '생년월일을 올바른 날짜 형식으로 입력해 주세요.';
  if (lower.includes('password must be')) {
    return '비밀번호는 10자 이상이며 영문, 숫자, 특수문자 중 2종류 이상을 포함해야 합니다.';
  }
  if (lower.includes('email already registered')) return '이미 가입된 이메일입니다.';
  if (lower.includes('invalid email') || lower.includes('email must be an email')) {
    return '이메일 형식이 올바르지 않습니다.';
  }
  if (lower.includes('must be 14')) return '만 14세 이상만 가입할 수 있습니다.';
  if (lower.includes('account locked')) return '계정이 잠겼습니다. 잠시 후 다시 시도해 주세요.';
  if (lower.includes('admin unavailable')) return '관리자 계정을 사용할 수 없습니다.';
  if (lower.includes('invalid code')) return '인증 코드가 올바르지 않습니다.';
  if (lower.includes('code expired') || lower.includes('not requested')) {
    return '인증 코드가 만료되었거나 요청 내역이 없습니다. 다시 요청해 주세요.';
  }
  if (lower.includes('too many attempts')) return '시도 횟수를 초과했습니다. 다시 코드를 요청해 주세요.';
  if (lower.includes('invalid credentials') || lower.includes('unauthorized')) {
    return '아이디 또는 비밀번호가 올바르지 않습니다.';
  }
  if (lower.includes('idempotency-key')) return '주문 요청 식별자가 누락되었습니다. 새로고침 후 다시 시도해 주세요.';
  if (lower.includes('out of stock')) return '재고가 부족합니다.';
  if (lower.includes('not payable')) return '현재 결제할 수 없는 주문입니다.';
  if (lower.includes('payment already finalized')) return '이미 결제가 완료되었거나 종료된 주문입니다.';
  if (lower.includes('bank transfer order cannot create payment intent')) {
    return '무통장입금 주문은 카드/간편결제 요청을 만들 수 없습니다.';
  }
  if (lower.includes('payment amount mismatch')) return '결제 금액이 주문 금액과 일치하지 않습니다.';
  if (lower.includes('payment not found')) return '결제 정보를 찾을 수 없습니다.';
  if (lower.includes('order not found')) return '주문 정보를 찾을 수 없습니다.';
  if (lower.includes('address not found')) return '배송지 정보를 찾을 수 없습니다.';
  if (lower.includes('product not found')) return '상품 정보를 찾을 수 없습니다.';
  if (lower.includes('not found')) return '요청한 정보를 찾을 수 없습니다.';
  if (lower.includes('forbidden')) return '이 작업을 수행할 권한이 없습니다.';
  if (lower.includes('bad request')) return '입력값을 확인해 주세요.';
  if (lower.includes('request failed')) return fallbackKoreanMessage(status);

  return fallbackKoreanMessage(status);
}

function fallbackKoreanMessage(status?: number): string {
  if (status === 400) return '입력값을 확인해 주세요.';
  if (status === 401) return '로그인이 필요하거나 인증 정보가 올바르지 않습니다.';
  if (status === 403) return '이 작업을 수행할 권한이 없습니다.';
  if (status === 404) return '요청한 정보를 찾을 수 없습니다.';
  if (status === 409) return '이미 처리되었거나 중복된 요청입니다.';
  if (status === 422) return '입력값을 확인해 주세요.';
  if (status === 429) return '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  if (status && status >= 500) return '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
  return '요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
}
