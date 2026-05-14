/**
 * 모바일 환경변수.
 * Expo 는 `EXPO_PUBLIC_*` 만 클라이언트 번들에 포함시킨다 — 시크릿은 절대 넣지 말 것.
 *
 * 개발 시 안드로이드 에뮬레이터: 호스트 머신 = 10.0.2.2.
 * 실기기 디버깅: 같은 Wi-Fi 네트워크의 호스트 PC LAN IP (예: 192.168.x.x).
 */
const FALLBACK_DEV_BASE_URL = "http://10.0.2.2:4000";

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? FALLBACK_DEV_BASE_URL;

/**
 * OAuth 흐름용 HTTPS 백엔드 URL — 카카오/네이버/구글이 콜백할 때 사용.
 * ngrok 같은 HTTPS 터널 URL 또는 운영 도메인.
 * 일반 API 는 LAN IP 로 직접 호출, OAuth 시작/콜백만 이 URL 사용.
 */
export const OAUTH_BASE_URL =
  process.env.EXPO_PUBLIC_OAUTH_BASE_URL ?? API_BASE_URL;

/**
 * 백엔드가 상대 경로(`/uploads/xxx.jpg`)로 내려준 이미지 URL 을 절대 URL 로 변환.
 * `https://` 는 그대로 통과. `http://` 는 dev 빌드(`__DEV__`)에서만 허용 — prod 에서는 null
 * (MITM 변조/iOS ATS 차단 회피 방지).
 * null/undefined/빈 문자열 → null (호출부에서 placeholder 처리).
 */
export function resolveImageUrl(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  if (url.startsWith("https://")) return url;
  if (url.startsWith("http://")) return __DEV__ ? url : null;
  if (url.startsWith("/")) return `${API_BASE_URL}${url}`;
  return `${API_BASE_URL}/${url}`;
}
