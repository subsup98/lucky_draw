import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FieldCipherService } from '../crypto/field-cipher.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

interface Plain {
  recipient: string;
  phone: string;
  postalCode: string;
  addressLine1: string;
  addressLine2?: string | null;
}

@Injectable()
export class AddressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipherService,
  ) {}

  private aad(col: string) {
    return FieldCipherService.aad('Address', col);
  }

  private encryptFields(p: Plain) {
    return {
      recipient: this.cipher.encrypt(p.recipient, this.aad('recipient'))!,
      phone: this.cipher.encrypt(p.phone, this.aad('phone'))!,
      postalCode: this.cipher.encrypt(p.postalCode, this.aad('postalCode'))!,
      addressLine1: this.cipher.encrypt(p.addressLine1, this.aad('addressLine1'))!,
      addressLine2: p.addressLine2
        ? this.cipher.encrypt(p.addressLine2, this.aad('addressLine2'))
        : null,
    };
  }

  private decryptRow<
    T extends { recipient: string; phone: string; postalCode: string; addressLine1: string; addressLine2: string | null },
  >(a: T): T {
    return {
      ...a,
      recipient: this.cipher.decrypt(a.recipient, this.aad('recipient')) ?? a.recipient,
      phone: this.cipher.decrypt(a.phone, this.aad('phone')) ?? a.phone,
      postalCode: this.cipher.decrypt(a.postalCode, this.aad('postalCode')) ?? a.postalCode,
      addressLine1:
        this.cipher.decrypt(a.addressLine1, this.aad('addressLine1')) ?? a.addressLine1,
      addressLine2: a.addressLine2
        ? this.cipher.decrypt(a.addressLine2, this.aad('addressLine2'))
        : a.addressLine2,
    };
  }

  async list(userId: string) {
    const rows = await this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
    return rows.map((r) => this.decryptRow(r));
  }

  async findOneOwned(userId: string, addressId: string) {
    const row = await this.prisma.address.findUnique({ where: { id: addressId } });
    if (!row) throw new NotFoundException('address not found');
    if (row.userId !== userId) throw new ForbiddenException();
    return this.decryptRow(row);
  }

  async create(userId: string, dto: CreateAddressDto) {
    return this.prisma.$transaction(async (tx) => {
      const existingCount = await tx.address.count({ where: { userId } });
      const willBeDefault = dto.isDefault === true || existingCount === 0;
      if (willBeDefault) {
        // 기존 디폴트 해제
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }
      const created = await tx.address.create({
        data: {
          userId,
          ...this.encryptFields({
            recipient: dto.recipient,
            phone: dto.phone,
            postalCode: dto.postalCode,
            addressLine1: dto.addressLine1,
            addressLine2: dto.addressLine2 ?? null,
          }),
          isDefault: willBeDefault,
        },
      });
      return this.decryptRow(created);
    });
  }

  async update(userId: string, addressId: string, dto: UpdateAddressDto) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.address.findUnique({ where: { id: addressId } });
      if (!existing) throw new NotFoundException('address not found');
      if (existing.userId !== userId) throw new ForbiddenException();

      const data: Prisma.AddressUpdateInput = {};
      if (dto.recipient !== undefined)
        data.recipient = this.cipher.encrypt(dto.recipient, this.aad('recipient'))!;
      if (dto.phone !== undefined)
        data.phone = this.cipher.encrypt(dto.phone, this.aad('phone'))!;
      if (dto.postalCode !== undefined)
        data.postalCode = this.cipher.encrypt(dto.postalCode, this.aad('postalCode'))!;
      if (dto.addressLine1 !== undefined)
        data.addressLine1 = this.cipher.encrypt(dto.addressLine1, this.aad('addressLine1'))!;
      if (dto.addressLine2 !== undefined)
        data.addressLine2 = dto.addressLine2
          ? this.cipher.encrypt(dto.addressLine2, this.aad('addressLine2'))
          : null;
      if (dto.isDefault === true) {
        await tx.address.updateMany({
          where: { userId, isDefault: true, NOT: { id: addressId } },
          data: { isDefault: false },
        });
        data.isDefault = true;
      }
      const updated = await tx.address.update({ where: { id: addressId }, data });
      return this.decryptRow(updated);
    });
  }

  async remove(userId: string, addressId: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.address.findUnique({ where: { id: addressId } });
      if (!existing) throw new NotFoundException('address not found');
      if (existing.userId !== userId) throw new ForbiddenException();
      await tx.address.delete({ where: { id: addressId } });
      // 삭제한 게 디폴트였으면 가장 최신 주소를 디폴트로
      if (existing.isDefault) {
        const next = await tx.address.findFirst({
          where: { userId },
          orderBy: { updatedAt: 'desc' },
        });
        if (next) {
          await tx.address.update({
            where: { id: next.id },
            data: { isDefault: true },
          });
        }
      }
      return { ok: true };
    });
  }
}
