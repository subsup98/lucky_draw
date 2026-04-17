// API 응답 공통 타입. 실제 응답 타입은 도메인 작업에서 확장합니다.

export type ApiSuccess<T> = {
  ok: true;
  data: T;
};

export type ApiError = {
  ok: false;
  code: string;
  message: string;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
