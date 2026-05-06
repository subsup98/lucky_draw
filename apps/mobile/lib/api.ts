import { createApiClient, ApiError } from "@lucky/api-client";
import { API_BASE_URL } from "./env";
import { secureTokenStore } from "./secure-store";

/**
 * 모바일 전용 API 클라이언트.
 * - mode: 'mobile' → 모든 요청에 X-Client: mobile 헤더 자동, refresh 는 body 의 refreshToken 사용.
 * - 401 자동 refresh + 단일 인플라이트 (라이브러리 내부에서 처리).
 * - onUnauthorized: refresh 도 실패하면 토큰을 비우고 로그인 화면으로 이동(추후 router.replace 연결).
 */
const client = createApiClient({
  mode: "mobile",
  baseUrl: API_BASE_URL,
  refreshPath: "/api/auth/refresh",
  authPathPrefix: "/api/auth/",
  store: secureTokenStore,
  onUnauthorized: () => {
    // TODO: 라우터 연결 시 router.replace('/login') 호출.
  },
});

export const api = client.fetch;
export const setAccessToken = client.setAccessToken;
export const clearTokens = client.clearTokens;
export { ApiError };
