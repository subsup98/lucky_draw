# backend/admin / PROGRESS.md

관리자 공통 도메인(관리자 계정, 권한) 진행 로그.

> 참조 문서: `api.md`(§8), `security.md`(관리자 권한), `architecture.md`(§6.2), `requirements.md`(§2.3, §2.4).

## 설계 결정 (2026-04-21)

- **인증 플로우**: 비밀번호 + TOTP 2FA 의무. 최초 로그인 시 QR 등록 강제.
- **잠금**: 로그인 5회 실패 시 15분 계정 잠금.
- **백업 코드**: 10개 일회성 코드 발급(TOTP 디바이스 분실 대비).
- **쿠키**: `lucky_admin_rt`, Path=`/api/admin`, refresh TTL 1일(유저 14일보다 짧게).
- **시크릿 분리**: `ADMIN_JWT_ACCESS_SECRET` — 유저용과 독립.
- **초기 관리자 생성**: seed 스크립트(`ADMIN_SEED_USERNAME/EMAIL/PASSWORD` env).
- **프런트 분리**: 별도 `apps/admin` (Next.js + Ant Design, 포트 3001). 도메인·쿠키·번들 격리.
- **audit-logs 필터**: actor + action + resourceType + 날짜범위 + 페이지네이션 (운영 중 조사용. 진지한 분석은 BI/DB 직접).

## 로그인 단계 (확정)

1. `POST /api/admin/auth/login {username, password}`
   - 잠금 상태면 423.
   - 실패 시 `failedLoginCount++` (≥5 → `lockedUntil=+15m`), 401.
   - 성공 + `totpSecret` 없음 → `{ stage: "ENROLL_REQUIRED", challengeToken, otpauthUrl, qrDataUrl }`.
   - 성공 + `totpSecret` 있음 → `{ stage: "TOTP_REQUIRED", challengeToken }`.
2. `POST /api/admin/auth/totp/enroll {challengeToken, code}` → 시크릿 확정 + 10개 backup code 생성 → 토큰 발급 + `{ backupCodes }` 1회 노출.
3. `POST /api/admin/auth/totp/verify {challengeToken, code}` → 토큰 발급.
4. `POST /api/admin/auth/backup-code {challengeToken, code}` → 코드 소진 + 토큰 발급.
5. `POST /api/admin/auth/refresh` / `logout` / `GET /admin/auth/me`.

- **challengeToken**: Redis 키 `admin:challenge:{token}` → `{ adminId, stage, pendingSecret? }` TTL 5분.

## 변경 로그

### 2026-04-21
- 설계 확정 (위 결정 사항들).
- 스키마 확장 완료 (`apps/backend/prisma/schema.prisma`):
  - `AdminUser` 에 `totpSecret`, `totpEnrolledAt`, `failedLoginCount`, `lockedUntil`, `tokenVersion` 추가.
  - 신규 모델 `AdminBackupCode { id, adminUserId, codeHash, usedAt?, createdAt }` 추가.

### 2026-04-22
- **Admin 인증 + TOTP 2FA MVP 완료** — `src/admin-auth/`.
- **의존성**: `otplib@^12.0.1`(13.x 는 @scure/base ESM 충돌로 Node CJS 로드 실패 → 12 로 고정), `qrcode@^1.5.4`, `@types/qrcode`.
- **마이그레이션**: `20260422_admin_totp` 적용 — `AdminUser` TOTP/잠금/토큰버전 필드, `AdminBackupCode` 테이블.
- **라우팅**:
  - `POST /api/admin/auth/login` — 잠금 시 423 `{lockedUntil}`, 비밀번호 실패는 `failedLoginCount++`(≥5 → `+15m` 잠금) 후 401. 성공 + `totpSecret=null` → `{stage:"ENROLL_REQUIRED", challengeToken, otpauthUrl, qrDataUrl}`. 성공 + 등록된 경우 → `{stage:"TOTP_REQUIRED", challengeToken}`.
  - `POST /api/admin/auth/totp/enroll` — challenge 검증 → `authenticator.verify` → `totpSecret` 확정 + 10개 backup code(12hex, `xxxx-xxxx-xxxx` 포맷) 해시 저장 → 토큰 발급 + `backupCodes` 1회 노출.
  - `POST /api/admin/auth/totp/verify` — TOTP 검증 실패도 잠금 카운터에 포함.
  - `POST /api/admin/auth/backup-code` — SHA-256 해시 `timingSafeEqual` 매칭 + `usedAt` 표시.
  - `POST /api/admin/auth/{refresh,logout}`, `GET /api/admin/auth/me`.
- **쿠키**: `lucky_admin_rt`, `Path=/api/admin`, refresh TTL 1d(기본). 사용자 14d 와 격리.
- **시크릿 격리**: AuthModule JwtModule 이 `global:true` 라서 `JwtService` 주입이 사용자 시크릿으로 덮여씌워지는 문제 발생 → `AdminJwtService extends JwtService` 로 전용 인스턴스를 모듈 provider 로 직접 등록(ADMIN_JWT_ACCESS_SECRET / ADMIN_JWT_ACCESS_TTL). 토큰 payload 에 `aud:'admin'` 클레임.
- **AdminJwtAuthGuard**: Bearer 검증 → `aud==='admin'` → AdminUser 활성·`tokenVersion` 대조 → `req.admin = {id, username, role, tokenVersion}`.
- **Refresh rotation + reuse detection**: `admin:refresh:{id}:{tokenId}` Redis 해시 저장, 재사용 시 전체 revoke + `tokenVersion++`. Challenge 는 `admin:challenge:{token}` TTL 5m + consume-on-read.
- **audit-logs**: `GET /api/admin/audit-logs?actorType=&actorUserId=&adminUserId=&action=&targetType=&targetId=&from=&to=&limit=&cursor=` — 최신순, `limit` 1..200(기본 50), `cursor=id` 기반 페이지네이션(`take+1` 로 `hasNext` 판정).
- **seed 업데이트**: `ADMIN_SEED_{USERNAME,EMAIL,PASSWORD}` env 지원, 기본값은 기존 root/AdminPass1!. `totpSecret=null` 명시.
- **스모크 테스트 (전부 통과)**:
  1. 잘못된 비밀번호 → 401.
  2. 정상 로그인 → `ENROLL_REQUIRED` + qrDataUrl.
  3. `otpauthUrl` 의 `secret` 쿼리 → `authenticator.generate` → `totp/enroll` → 토큰 + backupCodes 10개.
  4. `GET /admin/auth/me` → `{id, username:'root', role:'SUPER_ADMIN'}`.
  5. `GET /admin/audit-logs?limit=3` → 3건 + `nextCursor` 존재(PAYMENT_WEBHOOK_CONFIRM 등 샘플 확인).
  6. `?action=ORDER_CREATE&limit=5` → 전부 해당 액션만 반환.
  7. 비인증 호출 → 401.
  8. 쿠키 refresh → 새 access 토큰.
  9. logout 204 → 재 refresh 401.

## 남은 체크리스트
- [x] 스키마: AdminUser TOTP 필드 + AdminBackupCode 모델
- [x] `otplib` + `qrcode` 설치 및 prisma migrate
- [x] `src/admin-auth/` 모듈 (service/controller/guard/DTO)
- [x] AdminJwtGuard (쿠키 Path=/api/admin, 전용 시크릿)
- [x] `GET /api/admin/audit-logs` (actor/action/resourceType/date 필터 + 페이지네이션)
- [x] seed 업데이트(`ADMIN_SEED_*` env, TOTP 미등록 상태 생성)
- [ ] 민감 작업 추가 인증 (step-up) — 후속
- [ ] 관리자 세션 관리 / 역할별 라우트 가드 — 후속
- [ ] 관리자 쿠지/재고/주문 관리 API — 후속
- [ ] 관리자 민감 작업 감사 로그 훅 — 후속

### 2026-04-23
- **관리자 API 확장** — 쿠지/티어/재고 CRUD + 배송 상태 PATCH + 기본 속도 제한(Redis 고정 윈도우).
- 상세는 [backend/kuji/PROGRESS.md](../kuji/PROGRESS.md#2026-04-23), [backend/shipment/PROGRESS.md](../shipment/PROGRESS.md#2026-04-23), 루트 [WORKLOG.md](../../WORKLOG.md) 2026-04-23 항목 참조.
- 속도 제한 적용 지점: `/api/auth/signup`(5/hr IP), `/api/auth/login`(10/5m IP+email), `/api/admin/auth/login`(10/5m IP+username), `/api/admin/auth/totp/{enroll,verify}`, `/api/admin/auth/backup-code`.
