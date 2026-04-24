import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 공개 공지 API — 비인증.
 * 게시된(publishedAt !== null) 공지만 노출.
 */
@Controller('notices')
export class NoticeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    return this.prisma.notice.findMany({
      where: { publishedAt: { not: null } },
      orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }],
      take: 50,
      select: {
        id: true,
        title: true,
        isPinned: true,
        publishedAt: true,
        createdAt: true,
      },
    });
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const notice = await this.prisma.notice.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        body: true,
        isPinned: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!notice || !notice.publishedAt) throw new NotFoundException('notice not found');
    return notice;
  }
}
