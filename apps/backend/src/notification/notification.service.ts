import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationMessageType,
  NotificationTargetType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type NotificationClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  userOrder(
    input: {
      userId?: string | null;
      orderId: string;
      messageType: NotificationMessageType;
      message: string;
      channel?: NotificationChannel;
    },
    client: NotificationClient = this.prisma,
  ) {
    return client.notification.create({
      data: {
        userId: input.userId ?? undefined,
        orderId: input.orderId,
        targetType: NotificationTargetType.USER,
        channel: input.channel ?? NotificationChannel.INTERNAL,
        messageType: input.messageType,
        message: input.message,
        status: 'PENDING',
      },
    });
  }

  adminIssue(
    input: {
      orderId?: string | null;
      message: string;
      channel?: NotificationChannel;
      messageType?: NotificationMessageType;
    },
    client: NotificationClient = this.prisma,
  ) {
    return client.notification.create({
      data: {
        orderId: input.orderId ?? undefined,
        targetType: NotificationTargetType.ADMIN,
        channel: input.channel ?? NotificationChannel.INTERNAL,
        messageType: input.messageType ?? NotificationMessageType.ISSUE_OCCURRED,
        message: input.message,
        status: 'PENDING',
      },
    });
  }

  async safeUserOrder(input: {
    userId?: string | null;
    orderId: string;
    messageType: NotificationMessageType;
    message: string;
    channel?: NotificationChannel;
  }) {
    try {
      await this.userOrder(input);
    } catch (err) {
      this.logger.warn(
        `notification failed type=${input.messageType} order=${input.orderId} err=${String(err)}`,
      );
    }
  }

  async safeAdminIssue(input: {
    orderId?: string | null;
    message: string;
    channel?: NotificationChannel;
    messageType?: NotificationMessageType;
  }) {
    try {
      await this.adminIssue(input);
    } catch (err) {
      this.logger.warn(
        `admin notification failed order=${input.orderId ?? '-'} err=${String(err)}`,
      );
    }
  }
}
