export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const ACCESS_TOKEN_KEY = "lucky_admin_at";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAccessToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
  else sessionStorage.removeItem(ACCESS_TOKEN_KEY);
}

async function refreshAccess(): Promise<string | null> {
  try {
    const res = await fetch("/api/admin/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { accessToken?: string };
    if (body.accessToken) {
      setAccessToken(body.accessToken);
      return body.accessToken;
    }
    return null;
  } catch {
    return null;
  }
}

async function rawFetch(path: string, init: RequestInit, token: string | null): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(path, { ...init, headers, credentials: "include" });
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const url = path.startsWith("/") ? path : `/${path}`;

  let token = getAccessToken();
  let res = await rawFetch(url, { ...init, headers }, token);

  if (res.status === 401 && !path.startsWith("/api/admin/auth/")) {
    const refreshed = await refreshAccess();
    if (refreshed) {
      res = await rawFetch(url, { ...init, headers }, refreshed);
    }
  }

  const text = await res.text();
  const body = text ? safeJson(text) : null;

  if (!res.ok) {
    const message =
      (body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : res.statusText) || "request failed";
    throw new ApiError(
      res.status,
      String((body as { error?: string })?.error ?? res.status),
      message,
    );
  }

  if (
    body &&
    typeof body === "object" &&
    "accessToken" in body &&
    typeof (body as { accessToken: unknown }).accessToken === "string"
  ) {
    setAccessToken((body as { accessToken: string }).accessToken);
  }

  return body as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
