import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductSaleStatus, ProductType } from '@prisma/client';
import { AuditLogService, type AuditContext } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';

@Injectable()
export class ProductService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async listPublic(typeRaw?: string, limitRaw?: string) {
    const limit = this.parseLimit(limitRaw, 100);
    const where: Prisma.ProductWhereInput = {
      saleStatus: 'ON_SALE',
      ...(this.parseType(typeRaw) ? { type: this.parseType(typeRaw) } : {}),
    };
    const now = new Date();
    where.AND = [
      { OR: [{ saleStartAt: null }, { saleStartAt: { lte: now } }] },
      { OR: [{ saleEndAt: null }, { saleEndAt: { gte: now } }] },
    ];
    return this.prisma.product.findMany({
      where,
      orderBy: [{ saleStartAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      select: this.publicSelect(),
    });
  }

  async detailPublic(idOrSlug: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
        saleStatus: 'ON_SALE',
      },
      select: this.publicSelect(),
    });
    if (!product) throw new NotFoundException('product not found');
    return product;
  }

  async listAdmin(statusRaw?: string, typeRaw?: string, limitRaw?: string) {
    const limit = this.parseLimit(limitRaw, 100);
    const status = this.parseStatus(statusRaw);
    const type = this.parseType(typeRaw);
    const where: Prisma.ProductWhereInput = {
      ...(status ? { saleStatus: status } : {}),
      ...(type ? { type } : {}),
    };
    return this.prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        _count: { select: { orderItems: true } },
      },
    });
  }

  async detailAdmin(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        _count: { select: { orderItems: true } },
      },
    });
    if (!product) throw new NotFoundException('product not found');
    return product;
  }

  async createAdmin(
    adminId: string,
    dto: CreateProductDto,
    ctx?: AuditContext,
  ) {
    this.validateDates(dto);
    try {
      const created = await this.prisma.product.create({
        data: {
          slug: dto.slug,
          name: dto.name,
          description: dto.description ?? null,
          imageUrl: dto.imageUrl ?? null,
          type: dto.type,
          price: dto.price,
          stock: dto.stock,
          saleStatus: 'DRAFT',
          saleStartAt: this.dateOrNull(dto.saleStartAt),
          saleEndAt: this.dateOrNull(dto.saleEndAt),
          preorderOpenedAt: this.dateOrNull(dto.preorderOpenedAt),
          preorderClosedAt: this.dateOrNull(dto.preorderClosedAt),
          expectedArrivalDate: this.dateOrNull(dto.expectedArrivalDate),
        },
      });
      void this.audit.record({
        actorType: 'ADMIN',
        adminUserId: adminId,
        action: 'PRODUCT_CREATE',
        targetType: 'Product',
        targetId: created.id,
        metadata: { slug: created.slug, type: created.type, price: created.price },
        ctx,
      });
      return created;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('slug already exists');
      }
      throw err;
    }
  }

  async updateAdmin(
    adminId: string,
    id: string,
    dto: UpdateProductDto,
    ctx?: AuditContext,
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { _count: { select: { orderItems: true } } },
    });
    if (!product) throw new NotFoundException('product not found');
    this.validateDates({ ...product, ...dto });

    const hasOrders = product._count.orderItems > 0;
    if (hasOrders && (dto.price !== undefined || dto.type !== undefined)) {
      throw new ConflictException('cannot change price/type after orders exist');
    }

    const data: Prisma.ProductUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.price !== undefined) data.price = dto.price;
    if (dto.stock !== undefined) data.stock = dto.stock;
    if (dto.saleStartAt !== undefined) data.saleStartAt = this.dateOrNull(dto.saleStartAt);
    if (dto.saleEndAt !== undefined) data.saleEndAt = this.dateOrNull(dto.saleEndAt);
    if (dto.preorderOpenedAt !== undefined) {
      data.preorderOpenedAt = this.dateOrNull(dto.preorderOpenedAt);
    }
    if (dto.preorderClosedAt !== undefined) {
      data.preorderClosedAt = this.dateOrNull(dto.preorderClosedAt);
    }
    if (dto.expectedArrivalDate !== undefined) {
      data.expectedArrivalDate = this.dateOrNull(dto.expectedArrivalDate);
    }

    const updated = await this.prisma.product.update({ where: { id }, data });
    void this.audit.record({
      actorType: 'ADMIN',
      adminUserId: adminId,
      action: 'PRODUCT_UPDATE',
      targetType: 'Product',
      targetId: id,
      metadata: { changed: Object.keys(data) },
      ctx,
    });
    return updated;
  }

  async updateStatusAdmin(
    adminId: string,
    id: string,
    saleStatus: ProductSaleStatus,
    ctx?: AuditContext,
  ) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('product not found');
    if (product.saleStatus === 'CLOSED' && saleStatus !== 'CLOSED') {
      throw new ConflictException('closed product cannot be reopened');
    }
    if (saleStatus === 'ON_SALE') {
      this.validateReadyForSale(product);
    }
    const updated = await this.prisma.product.update({
      where: { id },
      data: { saleStatus },
    });
    void this.audit.record({
      actorType: 'ADMIN',
      adminUserId: adminId,
      action: 'PRODUCT_STATUS_UPDATE',
      targetType: 'Product',
      targetId: id,
      metadata: { from: product.saleStatus, to: saleStatus },
      ctx,
    });
    return updated;
  }

  async deleteAdmin(adminId: string, id: string, ctx?: AuditContext) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { _count: { select: { orderItems: true } } },
    });
    if (!product) throw new NotFoundException('product not found');
    if (product._count.orderItems > 0) {
      throw new ConflictException('cannot delete product with orders');
    }
    await this.prisma.product.delete({ where: { id } });
    void this.audit.record({
      actorType: 'ADMIN',
      adminUserId: adminId,
      action: 'PRODUCT_DELETE',
      targetType: 'Product',
      targetId: id,
      metadata: { slug: product.slug },
      ctx,
    });
    return { ok: true };
  }

  private publicSelect() {
    return {
      id: true,
      slug: true,
      name: true,
      description: true,
      imageUrl: true,
      type: true,
      price: true,
      stock: true,
      saleStatus: true,
      saleStartAt: true,
      saleEndAt: true,
      preorderOpenedAt: true,
      preorderClosedAt: true,
      expectedArrivalDate: true,
      createdAt: true,
      updatedAt: true,
    } satisfies Prisma.ProductSelect;
  }

  private parseLimit(raw: string | undefined, fallback: number) {
    return Math.min(Math.max(parseInt(raw ?? String(fallback), 10) || fallback, 1), 200);
  }

  private parseType(raw?: string): ProductType | undefined {
    if (raw && (Object.values(ProductType) as string[]).includes(raw)) {
      return raw as ProductType;
    }
    return undefined;
  }

  private parseStatus(raw?: string): ProductSaleStatus | undefined {
    if (raw && (Object.values(ProductSaleStatus) as string[]).includes(raw)) {
      return raw as ProductSaleStatus;
    }
    return undefined;
  }

  private dateOrNull(value: string | Date | null | undefined) {
    if (value === undefined || value === null) return null;
    return value instanceof Date ? value : new Date(value);
  }

  private validateDates(input: {
    type?: ProductType | null;
    saleStartAt?: string | Date | null;
    saleEndAt?: string | Date | null;
    preorderOpenedAt?: string | Date | null;
    preorderClosedAt?: string | Date | null;
    expectedArrivalDate?: string | Date | null;
  }) {
    const saleStartAt = this.dateOrNull(input.saleStartAt);
    const saleEndAt = this.dateOrNull(input.saleEndAt);
    if (saleStartAt && saleEndAt && !(saleStartAt < saleEndAt)) {
      throw new BadRequestException('saleStartAt must be before saleEndAt');
    }

    const preorderOpenedAt = this.dateOrNull(input.preorderOpenedAt);
    const preorderClosedAt = this.dateOrNull(input.preorderClosedAt);
    if (preorderOpenedAt && preorderClosedAt && !(preorderOpenedAt < preorderClosedAt)) {
      throw new BadRequestException('preorderOpenedAt must be before preorderClosedAt');
    }

    if (input.type === 'PREORDER' && !this.dateOrNull(input.expectedArrivalDate)) {
      throw new BadRequestException('expectedArrivalDate is required for preorder products');
    }
  }

  private validateReadyForSale(product: {
    type: ProductType;
    price: number;
    stock: number;
    expectedArrivalDate: Date | null;
    saleStartAt: Date | null;
    saleEndAt: Date | null;
    preorderOpenedAt: Date | null;
    preorderClosedAt: Date | null;
  }) {
    if (product.price < 0) throw new BadRequestException('price must be valid');
    if (product.type === 'GENERAL' && product.stock <= 0) {
      throw new BadRequestException('general product requires stock');
    }
    if (product.type === 'PREORDER' && !product.expectedArrivalDate) {
      throw new BadRequestException('preorder product requires expectedArrivalDate');
    }
    this.validateDates(product);
  }
}
