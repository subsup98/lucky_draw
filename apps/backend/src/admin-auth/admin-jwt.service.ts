import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/**
 * 관리자 전용 JwtService 래퍼.
 * AuthModule 의 JwtModule 이 `global:true` 라서 `JwtService` 를 바로 주입하면
 * 사용자용(ADMIN_JWT_ACCESS_SECRET 가 아닌 JWT_ACCESS_SECRET) 인스턴스가 잡힘.
 * 전용 시크릿/TTL 을 가진 인스턴스를 별도 provider 로 격리.
 */
@Injectable()
export class AdminJwtService extends JwtService {
  constructor() {
    super({
      secret:
        process.env.ADMIN_JWT_ACCESS_SECRET ??
        'dev_admin_access_secret_change_me_in_prod',
      signOptions: { expiresIn: process.env.ADMIN_JWT_ACCESS_TTL ?? '15m' },
    });
  }
}
