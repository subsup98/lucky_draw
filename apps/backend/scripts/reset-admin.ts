/**
 * 관리자 계정 재설정 스크립트.
 *
 * 사용:
 *   1) apps/backend/.env 에 아래 3줄 설정
 *      ADMIN_SEED_USERNAME=원하는_아이디
 *      ADMIN_SEED_EMAIL=원하는@이메일
 *      ADMIN_SEED_PASSWORD=원하는_비밀번호
 *   2) 루트에서 실행:
 *      pnpm --filter @lucky/backend exec ts-node scripts/reset-admin.ts
 *
 * 동작:
 *   - 해당 username 이 있으면 email/passwordHash/role/잠금 초기화 (덮어쓰기)
 *   - 없으면 새로 생성
 *   - TOTP 도 초기화 — 다음 로그인 시 QR 재등록 강제
 *   - 기존 다른 username 을 쓰던 SUPER_ADMIN 이 한 명이면 그대로 두고 이 계정만 수정/생성
 *   - 기존 `root` 를 다른 이름으로 바꾸고 싶으면 ADMIN_SEED_OLD_USERNAME 지정
 *
 * 주의: 이 스크립트는 SUPER_ADMIN 권한으로 upsert 합니다. 운영 환경에선 주의해서 쓰세요.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_SEED_USERNAME;
  const email = process.env.ADMIN_SEED_EMAIL;
  const password = process.env.ADMIN_SEED_PASSWORD;
  const oldUsername = process.env.ADMIN_SEED_OLD_USERNAME;

  if (!username || !email || !password) {
    console.error('ADMIN_SEED_USERNAME / ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD 를 .env 에 설정하세요.');
    process.exit(1);
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  // 기존 이름 변경 모드: old → new 로 rename + 비번·email·TOTP 초기화
  if (oldUsername && oldUsername !== username) {
    const existing = await prisma.adminUser.findUnique({ where: { username: oldUsername } });
    if (existing) {
      const updated = await prisma.adminUser.update({
        where: { username: oldUsername },
        data: {
          username,
          email,
          passwordHash,
          totpSecret: null,
          totpEnrolledAt: null,
          mfaEnabled: false,
          failedLoginCount: 0,
          lockedUntil: null,
          tokenVersion: { increment: 1 }, // 기존 access/refresh 토큰 무효화
        },
      });
      await prisma.adminBackupCode.deleteMany({ where: { adminUserId: updated.id } });
      console.log(`[rename] ${oldUsername} → ${username}  (TOTP 재등록 필요)`);
      return;
    }
    console.log(`[rename] ${oldUsername} 이 없어 그냥 upsert 합니다.`);
  }

  // 단순 upsert (username 기준)
  const existing = await prisma.adminUser.findUnique({ where: { username } });
  const result = await prisma.adminUser.upsert({
    where: { username },
    create: {
      username,
      email,
      passwordHash,
      role: 'SUPER_ADMIN',
      mfaEnabled: false,
      totpSecret: null,
    },
    update: {
      email,
      passwordHash,
      totpSecret: null,
      totpEnrolledAt: null,
      mfaEnabled: false,
      failedLoginCount: 0,
      lockedUntil: null,
      tokenVersion: { increment: 1 },
    },
  });
  if (existing) {
    await prisma.adminBackupCode.deleteMany({ where: { adminUserId: result.id } });
  }
  console.log(
    `[${existing ? 'updated' : 'created'}] username=${username} email=${email} (TOTP 재등록 필요)`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
