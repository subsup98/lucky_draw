import { Injectable, Logger } from '@nestjs/common';
import { AuditActorType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditContext {
  ip?: string | null;
  userAgent?: string | null;
}

export interface AuditRecordInput {
  actorType: AuditActorType;
  actorUserId?: string | null;
  adminUserId?: string | null;
  action: string; // e.g. "ORDER_CREATE", "PAYMENT_CONFIRM", "DRAW_EXECUTE"
  targetType?: string | null; // e.g. "Order", "Payment", "DrawResult"
  targetId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  ctx?: AuditContext;
}

/**
 * 감사 로그 기록기.
 *
 * - 실패가 주 트랜잭션에 영향을 주지 않도록 `record()` 는 예외를 삼키고 Logger 로만 warn.
 * - 필요 시 `recordOrThrow()` 로 트랜잭션 내 동기 기록도 가능(현재는 사용 안 함).
 * - 호출자는 성공 직후(트랜잭션 커밋 이후) 호출해 "확정 사실"만 남긴다.
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditRecordInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorType: input.actorType,
          actorUserId: input.actorUserId ?? null,
          adminUserId: input.adminUserId ?? null,
          action: input.action,
          targetType: input.targetType ?? null,
          targetId: input.targetId ?? null,
          ip: input.ctx?.ip ?? null,
          userAgent: input.ctx?.userAgent ?? null,
          metadata: input.metadata ?? undefined,
        },
      });
    } catch (err) {
      this.logger.warn(
        `audit log failed action=${input.action} target=${input.targetType}:${input.targetId} err=${String(err)}`,
      );
    }
  }
}
