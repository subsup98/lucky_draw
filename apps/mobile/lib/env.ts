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
