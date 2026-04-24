import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { extractAuditCtx } from '../audit-log/audit-context';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInquiryDto } from './dto/inquiry.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class InquiryController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  @Post('inquiries')
  @HttpCode(201)
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateInquiryDto,
    @Req() req: Request,
  ) {
    if (dto.orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: dto.orderId },
        select: { userId: true },
      });
      if (!order) throw new BadRequestException('order not found');
      if (order.userId !== user.id) throw new ForbiddenException('order does not belong to you');
    }

    const created = await this.prisma.inquiry.create({
      data: {
        userId: user.id,
        orderId: dto.orderId ?? null,
        category: dto.category,
        subject: dto.subject,
        body: dto.body,
      },
    });
    await this.audit.record({
      actorType: 'USER',
      actorUserId: user.id,
      action: 'INQUIRY_CREATE',
      targetType: 'Inquiry',
      targetId: created.id,
      metadata: { category: created.category, orderId: created.orderId },
      ctx: extractAuditCtx(req),
    });
    return created;
  }

  @Get('me/inquiries')
  async listMine(@CurrentUser() user: AuthUser) {
    return this.prisma.inquiry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        category: true,
        subject: true,
        status: true,
        answeredAt: true,
        createdAt: true,
        orderId: true,
      },
    });
  }

  @Get('me/inquiries/:id')
  async findMine(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const inq = await this.prisma.inquiry.findUnique({ where: { id } });
    if (!inq) throw new NotFoundException('inquiry not found');
    if (inq.userId !== user.id) throw new ForbiddenException();
    return inq;
  }
}
