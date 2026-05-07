import { createApiClient, ApiError } from "@lucky/api-client";
import { router } from "expo-router";
import { API_BASE_URL } from "./env";
import { secureTokenStore } from "./secure-store";

const client = createApiClient({
  mode: "mobile",
  baseUrl: API_BASE_URL,
  refreshPath: "/api/auth/refresh",
  authPathPrefix: "/api/auth/",
  store: secureTokenStore,
  onUnauthorized: () => {
    // 401 + refresh 도 실패한 경우. zustand store 는 lib/auth-store 에서 별도로 갱신.
    // 여기서는 라우팅만 담당.
    router.replace("/login" as never);
  },
});

export const api = client.fetch;
export const setAccessToken = client.setAccessToken;
export const clearTokens = client.clearTokens;
export { ApiError };
