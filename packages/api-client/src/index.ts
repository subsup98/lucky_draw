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
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
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
