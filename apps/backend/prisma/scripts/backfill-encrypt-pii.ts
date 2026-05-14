/**
 * 기존 평문으로 저장된 개인정보 컬럼을 AES-256-GCM 으로 암호화하는 일회성 백필.
 *
 * 대상:
 *   - Shipment.{recipient, phone, postalCode, addressLine1, addressLine2}
 *   - Order.shippingSnapshot (JSON 객체 → { enc: "..." } 형태로 변환)
 *
 * 멱등:
 *   - 이미 `enc:v1:` 접두어 또는 `{ enc: ... }` 객체면 스킵
 *   - 중간 실패 시 재실행하면 처리되지 않은 행만 다시 처리
 *
 * 실행:
 *   ENCRYPTION_KEY=<base64-32bytes> \
 *   pnpm --filter backend exec tsx prisma/scripts/backfill-encrypt-pii.ts
 *
 * 운영 절차:
 *   1) 배포 직전: ENCRYPTION_KEY 를 secrets 에 등록 (한 번 분실하면 복원 불가)
 *   2) 신규 코드 배포 (FieldCipherService 가 평문도 읽을 수 있어 무중단)
 *   3) 본 스크립트 실행 → 모든 행 암호화
 *   4) 검증 후 FieldCipherService.decrypt 의 평문 fallback 을 strict 로 전환(선택)
 */

import { PrismaClient } from '@prisma/client';
import {
  createCipheriv,
  randomBytes,
} from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const PREFIX_V1 = 'enc:v1:';
const BATCH_SIZE = 200;

function loadKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('ENCRYPTION_KEY env required');
  }
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error(`ENCRYPTION_KEY must decode to 32 bytes (got ${buf.length})`);
  }
  return buf;
}

function aad(table: string, column: string): Buffer {
  return Buffer.from(`${table}:${column}`, 'utf8');
}

function encrypt(key: Buffer, plain: string, aadBuf: Buffer): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  cipher.setAAD(aadBuf);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX_V1 + Buffer.concat([iv, tag, ct]).toString('base64');
}

function isEncrypted(s: string | null | undefined): boolean {
  return typeof s === 'string' && s.startsWith(PREFIX_V1);
}

async function backfillShipments(prisma: PrismaClient, key: Buffer) {
  let processed = 0;
  let cursor: string | undefined;
  while (true) {
    const rows = await prisma.shipment.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        recipient: true,
        phone: true,
        postalCode: true,
        addressLine1: true,
        addressLine2: true,
      },
    });
    if (rows.length === 0) break;
    for (const r of rows) {
      const data: Record<string, string | null> = {};
      if (!isEncrypted(r.recipient))
        data.recipient = encrypt(key, r.recipient, aad('Shipment', 'recipient'));
      if (!isEncrypted(r.phone)) data.phone = encrypt(key, r.phone, aad('Shipment', 'phone'));
      if (!isEncrypted(r.postalCode))
        data.postalCode = encrypt(key, r.postalCode, aad('Shipment', 'postalCode'));
      if (!isEncrypted(r.addressLine1))
        data.addressLine1 = encrypt(key, r.addressLine1, aad('Shipment', 'addressLine1'));
      if (r.addressLine2 && !isEncrypted(r.addressLine2)) {
        data.addressLine2 = encrypt(key, r.addressLine2, aad('Shipment', 'addressLine2'));
      }
      if (Object.keys(data).length > 0) {
        await prisma.shipment.update({ where: { id: r.id }, data });
        processed += 1;
      }
    }
    cursor = rows[rows.length - 1]!.id;
    if (rows.length < BATCH_SIZE) break;
  }
  return processed;
}

async function backfillOrders(prisma: PrismaClient, key: Buffer) {
  let processed = 0;
  let cursor: string | undefined;
  while (true) {
    const rows = await prisma.order.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
      select: { id: true, shippingSnapshot: true },
    });
    if (rows.length === 0) break;
    for (const r of rows) {
      const snap = r.shippingSnapshot;
      // 이미 { enc: "..." } 형태이거나 null 이면 스킵
      if (
        snap === null ||
        snap === undefined ||
        (typeof snap === 'object' && snap !== null && 'enc' in snap)
      ) {
        continue;
      }
      const enc = encrypt(key, JSON.stringify(snap), aad('Order', 'shippingSnapshot'));
      await prisma.order.update({
        where: { id: r.id },
        data: { shippingSnapshot: { enc } },
      });
      processed += 1;
    }
    cursor = rows[rows.length - 1]!.id;
    if (rows.length < BATCH_SIZE) break;
  }
  return processed;
}

async function main() {
  const key = loadKey();
  const prisma = new PrismaClient();
  try {
    console.log('[backfill] starting Shipment...');
    const ship = await backfillShipments(prisma, key);
    console.log(`[backfill] Shipment: encrypted ${ship} row(s)`);

    console.log('[backfill] starting Order.shippingSnapshot...');
    const ord = await backfillOrders(prisma, key);
    console.log(`[backfill] Order: encrypted ${ord} row(s)`);

    console.log('[backfill] done.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[backfill] FAILED:', err);
  process.exit(1);
});
