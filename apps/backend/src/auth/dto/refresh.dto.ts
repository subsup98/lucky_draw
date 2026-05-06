import { IsOptional, IsString } from 'class-validator';

/**
 * 모바일 클라이언트(`X-Client: mobile`) 가 refresh / logout 호출 시
 * 쿠키 대신 body 로 refresh token 을 전달.
 * 웹은 쿠키로 처리하므로 본 필드는 무시되며, 따라서 `optional`.
 */
export class RefreshDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
