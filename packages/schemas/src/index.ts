import { z } from "zod";

// 예시 스키마. 실제 auth/user 스키마는 이후 도메인 작업에서 채웁니다.
export const EmailSchema = z.string().email();
export const PasswordSchema = z
  .string()
  .min(10, "비밀번호는 최소 10자 이상이어야 합니다");

export type Email = z.infer<typeof EmailSchema>;
export type Password = z.infer<typeof PasswordSchema>;
