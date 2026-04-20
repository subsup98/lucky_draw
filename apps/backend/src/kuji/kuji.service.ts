import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class KujiService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const now = new Date();
    const events = await this.prisma.kujiEvent.findMany({
      where: {
        status: { in: ['ON_SALE', 'SCHEDULED', 'PAUSED', 'SOLD_OUT'] },
      },
      orderBy: [{ status: 'asc' }, { saleStartAt: 'asc' }],
      select: {
        id: true,
        slug: true,
        title: true,
        coverImageUrl: true,
        pricePerTicket: true,
        totalTickets: true,
        soldTickets: true,
        saleStartAt: true,
        saleEndAt: true,
        status: true,
      },
    });
    return events.map((e) => ({
      ...e,
      remainingTickets: Math.max(0, e.totalTickets - e.soldTickets),
      isOnSale: e.status === 'ON_SALE' && e.saleStartAt <= now && e.saleEndAt >= now,
    }));
  }

  async detail(id: string) {
    const event = await this.prisma.kujiEvent.findUnique({
      where: { id },
      include: {
        prizeTiers: {
          orderBy: { displayOrder: 'asc' },
          include: {
            prizeItems: {
              select: { id: true, name: true, imageUrl: true, description: true },
            },
            inventory: {
              select: { totalQuantity: true, remainingQuantity: true },
            },
          },
        },
      },
    });
    if (!event) throw new NotFoundException('kuji not found');
    return event;
  }

  async remaining(id: string) {
    const event = await this.prisma.kujiEvent.findUnique({
      where: { id },
      select: {
        id: true,
        totalTickets: true,
        soldTickets: true,
        status: true,
        prizeTiers: {
          orderBy: { displayOrder: 'asc' },
          select: {
            id: true,
            rank: true,
            name: true,
            isLastPrize: true,
            inventory: {
              select: { totalQuantity: true, remainingQuantity: true },
            },
          },
        },
      },
    });
    if (!event) throw new NotFoundException('kuji not found');
    return {
      id: event.id,
      status: event.status,
      totalTickets: event.totalTickets,
      soldTickets: event.soldTickets,
      remainingTickets: Math.max(0, event.totalTickets - event.soldTickets),
      tiers: event.prizeTiers.map((t) => ({
        id: t.id,
        rank: t.rank,
        name: t.name,
        isLastPrize: t.isLastPrize,
        total: t.inventory?.totalQuantity ?? 0,
        remaining: t.inventory?.remainingQuantity ?? 0,
      })),
    };
  }
}
