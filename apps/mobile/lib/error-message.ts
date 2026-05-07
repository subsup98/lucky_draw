import { ApiError } from "./api";

/**
 * ApiError → 사용자에게 보여줄 한국어 메시지.
 * 백엔드는 영어 메시지를 내려주므로 status + message 키워드로 매핑.
 */
export function apiErrorToKo(e: unknown): string {
  if (!(e instanceof ApiError)) {
    return "요청 실패. 잠시 후 다시 시도해주세요.";
  }

  const raw = String(e.message || "").toLowerCase();

  // 인증 실패 — 열거 방지 위해 통합 메시지.
  if (e.status === 401) return "이메일 또는 비밀번호가 올바르지 않습니다.";
  if (e.status === 403) return "권한이 없습니다.";
  if (e.status === 404) return "요청한 정보를 찾을 수 없습니다.";
  if (e.status === 409 || raw.includes("already registered")) {
    return "이미 가입된 이메일입니다.";
  }
  if (e.status === 429) return "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
  if (e.status >= 500) return "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";

  // 400대 — 메시지 키워드로 한국어화.
  if (raw.includes("password must be")) {
    return "비밀번호는 10자 이상, 영문/숫자/기호 중 2종 이상을 포함해야 합니다.";
  }
  if (raw.includes("must be 14")) {
    return "만 14세 이상만 가입할 수 있습니다.";
  }
  if (raw.includes("invalid birthdate") || raw.includes("birthdate")) {
    return "생년월일 형식이 올바르지 않습니다.";
  }
  if (raw.includes("code expired") || raw.includes("not requested")) {
    return "인증 코드가 만료됐거나 요청 기록이 없습니다. 다시 요청해주세요.";
  }
  if (raw.includes("invalid code")) {
    return "인증 코드가 일치하지 않습니다.";
  }
  if (raw.includes("too many attempts")) {
    return "시도 횟수를 초과했습니다. 다시 코드를 요청해주세요.";
  }
  if (raw.includes("please wait") || raw.includes("cooldown")) {
    return "잠시 후 다시 시도해주세요.";
  }
  if (raw.includes("user not found")) {
    return "사용자를 찾을 수 없습니다.";
  }
  if (raw.includes("email")) {
    return "이메일 형식이 올바르지 않습니다.";
  }

  return "요청 처리 중 오류가 발생했습니다.";
}
