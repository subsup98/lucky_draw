import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UserService } from './user.service';

/**
 * 매일 03:30 (서버 로컬) 에 30일 유예 만료된 탈퇴 회원을 익명화한다.
 * 배치 1회 = 최대 500명 처리. 더 많으면 다음날 잡에서 이어서.
 */
@Injectable()
export class UserCron {
  private readonly logger = new Logger(UserCron.name);

  constructor(private readonly users: UserService) {}

  @Cron('0 30 3 * * *', { name: 'anonymize-expired-withdrawals' })
  async anonymizeJob(): Promise<void> {
    const result = await this.users.anonymizeExpired();
    if (result.total > 0) {
      this.logger.log(
        `[anonymize] processed=${result.processed} total=${result.total}`,
      );
    }
  }
}
