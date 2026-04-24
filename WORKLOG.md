# 전체 작업 로그 (WORKLOG.md)

이 문서는 프로젝트 전체 진행 내역을 통합해서 기록하는 로그입니다.
각 디렉토리 `PROGRESS.md`에서 의미 있는 변경/마일스톤이 발생하면 이 파일에 요약해 남겨주세요.

- **참조 전용 문서**(루트의 `README.md`, `requirements.md`, `security.md`, `policy.md`, `tasks.md`, `architecture.md`, `api.md`)는 수정하지 마세요.
- **기록/수정 대상**: 이 `WORKLOG.md` 및 각 디렉토리의 `PROGRESS.md`.

---

## 디렉토리 구조

```
lucky_draw/
├── README.md / requirements.md / security.md / policy.md / tasks.md / architecture.md / api.md  (참조 전용)
├── WORKLOG.md                      ← 전체 통합 로그
├── frontend/
│   ├── PROGRESS.md
│   ├── user/PROGRESS.md            ← 사용자 웹/앱
│   └── admin/PROGRESS.md           ← 관리자 웹
├── backend/
│   ├── PROGRESS.md
│   ├── auth/PROGRESS.md
│   ├── user/PROGRESS.md
│   ├── kuji/PROGRESS.md
│   ├── prize/PROGRESS.md
│   ├── inventory/PROGRESS.md
│   ├── order/PROGRESS.md
│   ├── payment/PROGRESS.md
│   ├── draw/PROGRESS.md
│   ├── shipment/PROGRESS.md
│   ├── notice/PROGRESS.md
│   ├── inquiry/PROGRESS.md
│   ├── admin/PROGRESS.md
│   └── audit-log/PROGRESS.md
├── database/PROGRESS.md
├── infra/PROGRESS.md
└── qa/PROGRESS.md
```

---

## 기록 원칙

1. 날짜는 `YYYY-MM-DD` 형식으로 기록.
2. 작업 단위는 "무엇을 / 왜 / 결과(성공·실패·보류)" 순으로 간결하게.
3. 의사결정(기술 선택, 정책 해석 등)은 근거를 함께 남긴다.
4. 막힌 부분은 `BLOCKER:` 접두로 표시.
5. 완료된 항목은 체크(`- [x]`) 처리.

---

## 2026-04-21 — 관리자 인증 / TOTP 2FA 착수 (중단)

- **결정**: MVP부터 TOTP 2FA 의무 포함. `security.md` 의 "관리자 TOTP 의무화" 방침 즉시 적용.
  - 로그인 5회 실패 → 15분 잠금, 백업 코드 10개, 최초 로그인 시 QR 강제 등록.
  - audit-logs 필터: actor + action + resourceType + 날짜범위 + 페이지네이션.
  - 관리자 프런트는 별도 `apps/admin` (이미 스캐폴딩만 된 상태, Next.js + Ant Design).
  - 쿠키 Path=`/api/admin`, refresh TTL 1d, 시크릿 분리(`ADMIN_JWT_ACCESS_SECRET`).
  - 초기 관리자는 seed 스크립트 + `.env`.
- **환불/부분취소(③)**: 본 사이클에서 제외. 정책 재결정 후 별도 진행.
- **진행**: 스키마 확장 완료 (`AdminUser` TOTP/잠금 필드, `AdminBackupCode` 모델). 자세한 내용은 `backend/admin/PROGRESS.md`.
- **BLOCKER**: 의존성 설치(`otplib`, `qrcode`, `@types/qrcode`) 및 `prisma migrate` 직전 중단. 재개 시 이 단계부터.

---

## 마일스톤 로그

### 2026-04-17
- 디렉토리 스캐폴딩 완료. 루트 참조 문서에 수정 금지 배너 추가.
- **백엔드 기술 스택 확정**: NestJS + PostgreSQL + Prisma + Redis.
  - 결정 근거: 팀 언어 경험이 없는 상태에서 학습 곡선 완만, 프론트(Next.js)와 TypeScript 공유, 도메인 13개가 Nest `Module`과 1:1 매칭, 국내 결제사(토스페이먼츠·포트원) Node SDK 공식 지원.
  - 운영 가정: 평상시 1,000명 + 오픈런 스파이크 대응. MVP부터 Redis 카운터(재고)·멱등성 키·응답 캐시 반영.
  - 상세 근거는 [backend/PROGRESS.md](backend/PROGRESS.md#기술-스택-확정-2026-04-17) 참조.

- **프론트엔드 기술 스택 확정**: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui(사용자) + Ant Design(관리자) + TanStack Query + Zustand + React Hook Form + Zod.
  - 결정 근거: 백엔드(NestJS)와 TypeScript·Zod 스키마 공유, SSR/SSG/ISR 혼용으로 SEO·이미지 최적화 대응, CDN 캐시로 오픈런 스파이크 2중 방어, React Native 전환 여지.
  - 모노레포 구성: pnpm workspace + Turborepo (`apps/user`, `apps/admin`, `apps/backend`, `packages/schemas`, `packages/api-types`, `packages/ui`).
  - 상세 근거는 [frontend/PROGRESS.md](frontend/PROGRESS.md#기술-스택-확정-2026-04-17) 참조.
- **인증 설계 확정**: JWT Access(15분, 메모리) + Opaque Refresh(14일, HttpOnly 쿠키 + Redis 저장).
  - Refresh Rotation + Reuse Detection으로 탈취 감지 시 전체 세션 무효화.
  - Argon2id 비밀번호 해시, tokenVersion 기반 강제 로그아웃, Double-Submit CSRF 방어.
  - 관리자는 별도 쿠키 Path + 1일 refresh + 민감 작업 전 재인증.
  - 상세는 [backend/auth/PROGRESS.md](backend/auth/PROGRESS.md#인증-설계-확정-2026-04-17).
- **결제 서비스 특화 보안 확정** (결정 갱신):
  - 업계 벤치마크: Stripe(쿠키+Idempotency), PayPal/Google(OAuth2 access+refresh), 카카오/쿠팡(쿠키 세션), 은행(FAPI/DPoP).
  - 우리 위치: 일반 e-commerce 상위권 수준(카카오·쿠팡 급), 은행 FAPI 아래. 이치방쿠지 서비스에 적정.
  - **계정 보안 레이어**: 이상 로그인 감지·Device Fingerprint·HIBP 유출 DB 대조·계정 잠금(10회/30분)·로그인 알림·Step-up 재인증(5분).
  - **관리자 TOTP 2FA 의무화** (MVP부터). 최초 로그인 시 TOTP 등록 강제 + 백업 코드 10개.
  - **HaveIBeenPwned API(k-anonymity)** 비밀번호 유출 대조 — 회원가입·비밀번호 변경 시 거부.
  - **결제 멱등성 5개 축 전부 MVP 반영**: Idempotency-Key 의무 / 주문 상태 머신 + SELECT FOR UPDATE / paymentKey UNIQUE / Client confirm + Webhook 이중 검증 + 5분 배치 재조회 / PaymentIntent 사전 발급(HMAC 서명, 5m TTL).
  - 상세: [backend/auth/PROGRESS.md](backend/auth/PROGRESS.md), [backend/payment/PROGRESS.md](backend/payment/PROGRESS.md), [backend/order/PROGRESS.md](backend/order/PROGRESS.md).
  - 2차 보류: DPoP · Passkey · 소셜 로그인(카카오/네이버/구글) · 사용자 TOTP 의무화.

- **모노레포 스캐폴딩 완료** (하이브리드: nvm + .nvmrc / Docker Compose for infra / 로컬 Node 실행).
  - 루트: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.nvmrc`(Node 22), `.gitignore`, `.env.example`, `docker-compose.yml`(Postgres 16 + Redis 7).
  - `apps/backend` (NestJS 10, 포트 4000, `/api` 프리픽스, 헬스체크 `GET /api/health`, Prisma 스켈레톤).
  - `apps/user` (Next 14 App Router, 포트 3000, Tailwind).
  - `apps/admin` (Next 14 App Router, 포트 3001, Ant Design).
  - `packages/schemas` (Zod 공유), `packages/api-types` (API 응답 타입 공유), `packages/ui` (공통 컴포넌트).
  - 다음: `pnpm install` 실행 → Docker Compose 기동 → Prisma 스키마 설계.
- **로컬 환경 부트스트랩 완료**:
  - nvm-windows 1.2.2 설치(winget) → Node 22.11.0 활성화.
  - pnpm 9.15.9 전역 설치.
  - `pnpm install` 성공 (975 패키지, 7분 소요).
  - `class-validator`, `class-transformer` 추가 설치(ValidationPipe 의존성).
  - Docker Desktop 기동 → `docker compose up -d` → Postgres 16 / Redis 7 healthy.
  - `apps/backend/.env` 생성(Prisma가 로컬 .env를 참조).
  - **첫 Prisma 마이그레이션 성공**: `init_scaffold` → `ScaffoldPing` 테이블 생성.
  - **스모크 테스트 통과**: `GET /api/health` → 200 `{status:"ok"}`, Postgres `pg_isready` OK, Redis `PING` → PONG.
  - 다음: Prisma 스키마 본격 설계 (`architecture.md` §5의 14개 엔티티).

### 2026-04-20
- **Prisma 스키마 본설계 완료** — `architecture.md` §5의 14개 엔티티 + 9개 enum + 관계·인덱스·동시성 제약.
  - 엔티티: User, Address, KujiEvent, PrizeTier, PrizeItem, Inventory, Order, Payment, DrawResult, Shipment, Notice, Inquiry, AdminUser, AuditLog.
  - **동시성 제약**: `Inventory.version`(낙관적 락 CAS) / `DrawResult(orderId, ticketIndex)` UNIQUE(중복 추첨 차단) / `Payment.orderId`·`providerTxId` UNIQUE(중복 결제 확정 차단) / `Order.idempotencyKey` UNIQUE(주문 멱등성).
  - **개인정보 최소화**: 주문 시점 배송지 스냅샷(`Order.shippingSnapshot`, `Shipment` 본체 필드)을 원본 `Address`와 분리해 이력 불변성 확보.
  - **감사 가능성**: `DrawResult.seed`/`snapshot`으로 추첨 재현성 확보(`security.md` §6.3), `AuditLog`에 actor 타입·대상·IP·UA·metadata 구조화.
  - 마이그레이션 `20260420004637_core_entities` 적용 성공, `ScaffoldPing` 제거, Prisma Client 재생성.
  - 상세: [database/PROGRESS.md](database/PROGRESS.md#2026-04-20).
  - 다음: 백엔드 도메인 모듈에 Prisma 연결, 시드 스크립트, 인증(`/auth/signup`·`/auth/login`) 구현.
- **PrismaModule / PrismaService 전역 주입 완료**.
  - `@Global()` 모듈 + NestJS 라이프사이클 훅(`OnModuleInit`/`OnModuleDestroy`)으로 `$connect`/`$disconnect` 자동화.
  - `HealthController`에 DB ping(`SELECT 1`) 추가 → `GET /api/health` 응답에 `db` 상태 포함.
  - 스모크 테스트 통과(`{status:"ok", db:"ok"}`).
  - 다음: Auth 도메인 구현(Argon2id 해시 + JWT Access/Refresh, `backend/auth/PROGRESS.md` 설계 기반).
- **Auth 도메인 MVP 완료** — `POST /auth/signup`·`/login`·`/refresh`·`/logout`.
  - Argon2id(64MB/3/4) + JWT HS256 Access(15m, `sub`+`tv`) + Opaque Refresh(`userId.tokenId.secret`, SHA-256 해시만 Redis 저장, 14d TTL).
  - **Rotation + Reuse Detection 동작 확인**: 구 refresh 재사용 → 401 + `tokenVersion++`로 전체 세션 revoke.
  - HttpOnly·SameSite=Lax 쿠키, 열거 방지(미존재 계정에도 더미 Argon2 verify), `JwtAuthGuard`로 `tokenVersion` 대조.
  - `User.tokenVersion` 컬럼 추가(마이그레이션 `add_user_token_version`). Redis 전역 모듈 도입.
  - 스모크 테스트 전부 통과(signup → login → refresh 회전 → 구 refresh 재사용 거부 + 새 refresh까지 전부 무효화).
  - 상세·TODO(HIBP·TOTP·CSRF·Device FP·계정 잠금·Step-up·속도 제한·RS256)는 [backend/auth/PROGRESS.md](backend/auth/PROGRESS.md#2026-04-20).
  - 다음: 시드 스크립트 + Kuji 조회 API(`GET /kujis`, `/kujis/:id`, `/kujis/:id/remaining`).
- **Prisma 시드 + Kuji 조회 API 완료**.
  - 시드: `prisma/seed.ts` — SUPER_ADMIN(`root` / `AdminPass1!`) + 데모 쿠지(slug=`demo-kuji-2026`, 45티켓, 5개 티어 S/A/B/C/LAST + Inventory + PrizeItem). `prisma.seed` 훅 등록 → `npx prisma db seed`로 실행.
  - API 3종: `GET /api/kujis`(목록·`remainingTickets`·`isOnSale` 파생 필드), `GET /api/kujis/:id`(티어/아이템/재고 join), `GET /api/kujis/:id/remaining`(티어별 `total`/`remaining`).
  - 실 호출 검증 통과. 상세: [backend/kuji/PROGRESS.md](backend/kuji/PROGRESS.md#2026-04-20).
  - 다음: Order → Payment → Draw 핵심 트랜잭션(멱등성·재고 CAS·추첨 엔진).

- **Order 도메인 MVP 완료** — `POST/GET /api/orders`, `POST /api/orders/:id/cancel`.
  - **멱등성 2단 방어**: Redis 캐시(24h, 최초 응답 재현) + DB `Order.idempotencyKey` UNIQUE(P2002 fallback). 동시 요청 락(`SET NX EX 30`)으로 병렬 중복 차단. 타 유저 키 재사용은 `Conflict`.
  - **재고 CAS**: `UPDATE KujiEvent SET soldTickets = soldTickets + :n WHERE status='ON_SALE' AND 기간 OK AND soldTickets + :n <= totalTickets` — affected rows 0 시 원인 재조회로 `NotFound / BadRequest / Conflict(out of stock)` 구체화. 티어별 `Inventory`는 추첨 단계에서 차감.
  - **perUserLimit**: 활성 주문(`status NOT IN (CANCELLED, FAILED, REFUNDED)`) 합산 검증.
  - **배송지 스냅샷**: DTO 그대로 `Order.shippingSnapshot` JSON + `capturedAt`. `Address` 이후 수정과 독립.
  - **취소**: 본인 + `PENDING_PAYMENT` 한정, 원자 상태 전이(`WHERE status='PENDING_PAYMENT'`) + `soldTickets` 원복. PAID 이후는 환불 플로우 예정.
  - 스모크 테스트: 최초 주문 201 → 동일 키 재요청 동일 응답 → perUserLimit 초과 400 → 헤더 누락 400 → 취소 200(`soldTickets` 0/45 복구) → 재취소 409 전부 통과.
  - 상세: [backend/order/PROGRESS.md](backend/order/PROGRESS.md#2026-04-20).
  - 다음: Payment 도메인(토스페이먼츠 Mock, PaymentIntent·confirm·webhook), Draw 엔진(`Inventory.version` CAS).

- **Payment 도메인 MVP 완료 (Mock provider)** — `POST /api/payments/{intent,confirm,webhook}`, `GET /api/payments/:orderId`.
  - **PaymentIntent**: HMAC-SHA256(`intentId.orderId.userId.amount.exp`) 서명 + Redis `pay:intent:{id}` 5m TTL. 주문 소유·`PENDING_PAYMENT` 검증 후 발급, 소비 시 `DEL`.
  - **Confirm 단일 트랜잭션**: 서명 `timingSafeEqual` → `SELECT ... FOR UPDATE` 로 Order 락 → `amount` 일치 검증 → `Payment` 생성(`orderId`/`providerTxId` UNIQUE) → Order 원자 전이(`WHERE status='PENDING_PAYMENT'`). 이미 PAID 이고 동일 `providerTxId` 면 P2002 fallback으로 멱등 응답.
  - **Webhook 이중 검증**: `X-Mock-Signature` HMAC(`orderId.providerTxId.status`) 검증 → 동일 `providerTxId` 재수신은 `alreadyProcessed` 200. client confirm 누락 시 webhook 단독으로 Payment 생성 + Order 전이. 경합은 P2002 fallback.
  - **스모크 테스트**: intent 발급 → confirm 200 → intent 재사용 거부 400 → 위조 서명 401 → webhook 단독 PAID 200 → webhook 재전송 멱등 → 서명 위조 401. 전부 통과.
  - 상세: [backend/payment/PROGRESS.md](backend/payment/PROGRESS.md#2026-04-20).
  - 다음: Draw 엔진 — 결제 완료(PAID) 주문에 대해 `Inventory.version` CAS 로 티어별 재고 차감 + `DrawResult(orderId, ticketIndex)` UNIQUE 로 중복 추첨 차단, seed/snapshot 기록.

- **Draw 도메인 MVP 완료 (추첨 엔진 단일 트랜잭션)** — `POST /api/orders/:id/draw`, `GET /api/orders/:id/draws`.
  - **엔진**: 티켓 1..N 반복 → 잔량>0 티어 전량 조회 → `weight = remainingQuantity` 가중 랜덤 → `Inventory.version` CAS 차감(`UPDATE ... WHERE version=? AND remaining>0`, affected=0 시 재조회 후 재시도 최대 5회) → `DrawResult(orderId, ticketIndex)` UNIQUE 삽입 → 전부 성공 시 Order `PAID → DRAWN` 원자 전이.
  - **재현성(감사)**: 티켓별 `seed = randomBytes(16).hex`(상위 48비트 → [0,1) 정규화) + `snapshot`(티어별 `remainingBefore`·`version`, 선택된 `tierId/rank`, `totalWeight`, `algorithm: 'weighted-remaining-v1'`) DB 기록.
  - **단일 트랜잭션**: `$transaction(timeout:15s, ReadCommitted)` + Order `FOR UPDATE` 로 동시 draw 호출·부분 추첨 커밋 방지.
  - **멱등**: Order.status 이미 DRAWN 이면 트랜잭션 없이 기존 결과 반환. 내부 FOR UPDATE 이후 재확인.
  - **스모크 (end-to-end 파이프라인)**: signup → login → order(3장) → payment intent → confirm → draw 200(C 2장, A 1장) → draw 재호출 동일 결과 멱등 → GET draws → Order DRAWN → 재고 A 3→2, C 30→28 차감 확인. 전부 통과.
  - 상세: [backend/draw/PROGRESS.md](backend/draw/PROGRESS.md#2026-04-20).
- **🎯 Order → Payment → Draw 핵심 트랜잭션 구간 MVP 완료** — 오픈런 스파이크 대응 3중 방어(멱등성 / 재고 CAS / 중복 추첨 차단)가 전부 활성화됨.
  - 다음: Shipment 자동 생성 훅, AuditLog, 실 PG(토스페이먼츠) 통합, Redis 1차 재고 카운터 레이어, 라스트원상 전용 트리거.

- **Shipment MVP 완료** — DRAWN 전이 시점 자동 생성 훅 + 사용자 조회 2종(`GET /api/me/shipments`, `GET /api/shipments/:id`).
  - 자동 생성: `DrawService` 트랜잭션 내부, Order PAID→DRAWN 원자 전이 직후 `Order.shippingSnapshot` JSON을 Shipment 본체 필드로 복사. `Shipment.orderId` UNIQUE로 중복 차단, Draw 멱등 경로(재호출)는 `loadResults`만 반환해 재실행 없음.
  - 조회: 본인 shipments 50건 최근순 / 단건 조회 시 `order.userId` 검증해 타 유저 403.
  - 스모크 테스트: signup → login → order(2장·배송지 스냅샷) → intent → confirm(PAID) → draw(B×2) → Shipment 자동 1건 PENDING → `GET /me/shipments` 200 → `GET /shipments/:id` 본인 200·타 유저 403·비인증 401. 전부 통과.
  - 상세: [backend/shipment/PROGRESS.md](backend/shipment/PROGRESS.md#2026-04-20).
  - 이슈: `nest-cli.json`의 `deleteOutDir: true` + 증분 빌드 조합으로 `pnpm dev` 기동 시 `dist/main` 미생성 → `deleteOutDir: false` 로 변경해 watch 모드 정상화.

### 2026-04-21
- **Redis 1차 재고 카운터 레이어 완료** — `StockService.reserve/release` + OrderService 전 경로 주입.
  - **목적**: 오픈런 스파이크에서 `KujiEvent.soldTickets` UPDATE 경합을 Redis 카운터로 선-차단해 DB 부하·롤백 최소화. DB CAS(`WHERE soldTickets+N <= totalTickets`)는 source of truth 로 유지.
  - **키**: `kuji:stock:{kujiEventId}` — TTL 없음, 값은 "잔여 티켓 수". 없으면 DB `totalTickets - soldTickets` 로 lazy-init(`SET NX`).
  - **원자성**: `reserve` 는 Lua 스크립트로 GET → 체크 → DECRBY 를 1회 라운드트립에 처리. -1=재고부족 / -2=미초기화(init 후 1회 재시도) / 양수=남은 수량.
  - **장애 허용**: Redis 예외 시 게이트 skip 하고 DB CAS 에 위임 — Redis 다운으로 서비스 정지되지 않도록.
  - **복구 경로**: 주문 트랜잭션 예외 / `P2002` 경합 / `cancel` 전 경로에 `release(INCRBY n)` 호출. 오차 허용(release 실패도 상위 플로우 비파괴).
  - **스모크 테스트**: lazy-init 32 → 3장 주문 → 29 → cancel → 32 복구 / 카운터 0 강제 → 즉시 409 out-of-stock(DB write 없음) / perUserLimit 초과(400) → Redis 30 그대로 유지. 전부 통과.
  - 다음: 라스트원상 전용 트리거(마지막 티켓 구매자 자동 판정), 관리자 `/admin/audit-logs`, 실 PG 통합.

- **AuditLog MVP 완료** — `@Global()` 서비스 + `GET /api/me/audit-logs` + 4종 도메인 훅 주입.
  - **설계 원칙**: fire-and-forget(`record()` 는 예외를 삼키고 Logger warn) / 확정 사실만(주 트랜잭션 커밋 이후 호출) / IP·UA는 컨트롤러에서 `extractAuditCtx(req)` 헬퍼로 수집(X-Forwarded-For 우선, UA 512자 트림) / actorType 구분(USER / SYSTEM / 추후 ADMIN).
  - **주입 지점**: `OrderService.create` (201 신규만 `ORDER_CREATE`, 멱등 재응답은 생략) / `OrderService.cancel` → `ORDER_CANCEL` / `PaymentService.confirm` → `PAYMENT_CONFIRM` / `PaymentService.webhook` 단독 확정 경로 → `PAYMENT_WEBHOOK_CONFIRM`(actorType=SYSTEM) / `DrawService.execute` → `DRAW_EXECUTE`(티켓별 tierRank·isLastPrize 메타, 멱등 경로는 생략).
  - **조회 API**: `GET /api/me/audit-logs?action=&limit=` — 본인 로그만, `action` 정확 일치 필터, `limit` 1..100(기본 50), 최신순.
  - **스모크 테스트**: signup → order → intent → confirm → draw → `GET /me/audit-logs` 3건(ORDER_CREATE / PAYMENT_CONFIRM / DRAW_EXECUTE) IP `::1`·UA 정확히 기록. 별도 계정 order → cancel → `?action=ORDER_CANCEL` 1건 확인. 전부 통과.
  - 상세: [backend/audit-log/PROGRESS.md](backend/audit-log/PROGRESS.md#2026-04-21).
  - 다음: Redis 1차 재고 카운터 레이어(오픈런 DB 부하 방어), 라스트원상 전용 트리거, 관리자 `/admin/audit-logs`.

- **라스트원상 전용 트리거 완료** — `DrawService` 에 `isLastPrize=true` 티어 자동 배정 로직 추가.
  - **판정 규칙**: (1) `KujiEvent.soldTickets == totalTickets` (이벤트 완매) **AND** (2) 해당 주문이 이벤트의 최신 PAID/DRAWN 주문(`createdAt` 기준) **AND** (3) 현재 추첨 중인 ticketIndex 가 그 주문의 마지막 티켓. 세 조건 모두 만족할 때만 `awardLastPrize=true`.
  - **구현**: `drawOneWithCAS(..., awardLastPrize)` 6번째 파라미터 추가. 티어 조회 쿼리에 `pt."isLastPrize" = ${awardLastPrize}` 필터 삽입 — 일반 추첨에서 라스트원 티어가 후보에서 제외되고(= 일반 당첨으로 라스트상이 소비되지 않음), 라스트원 추첨에서는 `isLastPrize=true` 티어만 후보가 됨. Draw 트랜잭션 내부에서 판정해 일관된 스냅샷으로 본다.
  - **스모크 테스트**: 기존 15/45 판매 상태에서 3명 신규 유저가 각각 10장씩 주문/결제 → 정확히 완매(45/45). 세 번째(최신) 주문의 10번 티켓이 `LAST*(isLastPrize=true)` 당첨, 다른 모든 티켓은 `B/C/A`, 라스트 재고 1→0 정확히 1회 소비. 이전 주문들은 라스트 획득 없음. 전부 통과.
  - 상세: [backend/draw/PROGRESS.md](backend/draw/PROGRESS.md#2026-04-21).
  - 다음: 실 PG(토스페이먼츠) 통합, 관리자 `/admin/audit-logs`, 배송 상태 PATCH.

- **실 PG(토스페이먼츠) 통합 완료** — `PaymentProvider` 추상화 + `MockPaymentProvider` / `TossPaymentProvider` 두 구현.
  - **선택 방식**: `PAYMENT_PROVIDER=mock|toss` 환경변수로 런타임 전환. 부팅 시 `PaymentModule` 로그에 선택값 기록.
  - **Toss 승인 경로**: `POST /v1/payments/confirm` 을 Basic auth(secretKey:) + `Idempotency-Key: confirm_{paymentKey}` 로 직접 호출, 응답 `status==="DONE"` + `totalAmount` 일치 검증 → DB 트랜잭션에서 Payment 생성 + Order PAID 원자 전이.
  - **웹훅**: `toss-signature` 헤더의 HMAC-SHA256(rawBody) 검증. 서명 검증을 위해 `NestFactory.create({rawBody:true})` 활성화.
  - **리팩터 부작용 없음**: mock 회귀(intent → confirm 200 → 재confirm 멱등 → draw) 통과. Controller 의 confirm DTO 는 provider 마다 필드가 다르므로 `Record<string,unknown>` 수용, provider 내부 검증.
  - **Toss 실 네트워크 검증**: 위조 paymentKey 로 confirm 시 Toss sandbox 에서 `UNAUTHORIZED_KEY` 400 수신 확인(실제 호출 경로 입증). 금액 불일치는 Toss 호출 전 로컬 400. 웹훅 정상/재전송(멱등)/위조 서명/서명 누락 전부 통과.
  - 상세: [backend/payment/PROGRESS.md](backend/payment/PROGRESS.md#2026-04-21).
  - 다음: 프런트 Toss SDK 연결(결제창 → successUrl), 환불/부분취소 API, Toss 실 웹훅 포맷(이벤트 타입별) 세분화.

- **프런트 Toss SDK 연결 완료 (사용자 웹 MVP)** — Next 14 App Router + `@tosspayments/payment-sdk`.
  - **프록시 전략**: `apps/user/next.config.mjs` 에 `rewrites`로 `/api/:path*` → 백엔드(4000) 프록시. 같은 origin이라 CORS 불필요, HttpOnly 쿠키(`lucky_rt`)가 자연스럽게 전달됨.
  - **`app/lib/api.ts`**: `credentials:'include'` + `sessionStorage` access token 보관 + `Authorization: Bearer` 자동 첨부 + 401 시 `/api/auth/refresh` 1회 재시도 후 원 요청 재호출 + 응답에 `accessToken` 있으면 자동 저장.
  - **페이지 5종**: `/login`(로그인·회원가입 토글) / `/`(쿠지 목록) / `/kujis/[id]`(상세 + 티어 구성 + 구매·배송지 폼) / `/payment/success`(confirm + 자동 draw + 결과 리스트) / `/payment/fail`.
  - **구매 플로우**: `POST /orders`(Idempotency-Key는 브라우저 `sessionStorage[kujiId:count]` 에 캐시해 같은 의도의 재클릭을 동일 키로 흡수) → `POST /payments/intent` → provider 분기. **Toss 경로**: `loadTossPayments(clientKey).requestPayment('카드', {amount, orderId, orderName, successUrl, failUrl})` 리다이렉트 → successUrl에서 `paymentKey/orderId/amount`로 `/confirm` → `/orders/:id/draw` → 결과. **Mock 경로**: 프런트에서 랜덤 `providerTxId` 만들어 바로 `/confirm` → `/payment/success?mock=1` 이동.
  - **스모크 테스트(프록시)**: signup → login(accessToken 수신 + `lucky_rt` 쿠키 설정) → `GET /api/kujis` → `POST /api/orders`(Bearer+Idempotency-Key) → 409 `out of stock`(데모 쿠지 45/45 완매 상태, 즉 인증·프록시·라우팅 전부 정상). 빌드/타입체크 통과.
  - 상세: [frontend/user/PROGRESS.md](frontend/user/PROGRESS.md#2026-04-21).
  - 다음: 마이페이지(`/me`: 주문/추첨/배송 리스트), 관리자 `/admin/audit-logs`, 환불/부분취소 API + UI.

- **마이페이지 & 주문 상세 페이지 완료**.
  - `/me`: 주문/배송 탭. `GET /api/orders` + `GET /api/me/shipments` 병렬. 401 시 `/login` 자동 이동.
  - `/orders/[id]`: 주문 본체 + 결제(`GET /api/payments/:orderId`) + 추첨(`GET /api/orders/:id/draws`) + 배송(shipments에서 `orderId` 매칭 1건) 통합 렌더. 404·409를 null로 흡수해 섹션 숨김 UX. `PENDING_PAYMENT` 에서만 취소 버튼(`POST /api/orders/:id/cancel` → 재조회).
  - 홈 네비게이션에 "마이페이지" 링크 추가.
  - 타입체크 6개 패키지 모두 통과.
  - 상세: [frontend/user/PROGRESS.md](frontend/user/PROGRESS.md#2026-04-21).

### 2026-04-22
- **관리자 인증 + TOTP 2FA + 관리자 감사 로그 조회 MVP 완료** — 2026-04-21 BLOCKER 해제.
  - **의존성**: `otplib@^12.0.1`(13.x 는 `@scure/base` ESM 이슈로 CJS 환경에서 로드 불가 → 12 고정), `qrcode@^1.5.4`, `@types/qrcode`.
  - **마이그레이션**: `20260422_admin_totp` 적용(`AdminUser` TOTP/잠금/tokenVersion 필드, `AdminBackupCode`).
  - **`src/admin-auth/` 모듈** 신설:
    - `POST /api/admin/auth/login` → 잠금 423 / 실패 401(5회 → `+15m` 잠금) / 미등록 → `{stage:"ENROLL_REQUIRED", challengeToken, otpauthUrl, qrDataUrl}` / 등록 → `{stage:"TOTP_REQUIRED", challengeToken}`.
    - `POST /api/admin/auth/totp/enroll` → TOTP 검증 → `totpSecret` 확정 + 10개 backup code(12hex `xxxx-xxxx-xxxx`) SHA-256 해시 저장 → 토큰 + 1회 노출.
    - `POST /api/admin/auth/totp/verify`, `/backup-code`, `/refresh`, `/logout`, `GET /me`.
  - **쿠키/시크릿 격리**: `lucky_admin_rt` Path=`/api/admin`, refresh TTL 1d. AuthModule JwtModule 이 `global:true` 라서 `JwtService` 직접 주입 시 사용자 시크릿으로 덮여씌워지는 충돌 → `AdminJwtService extends JwtService` 전용 provider 로 `ADMIN_JWT_ACCESS_SECRET` 분리. 토큰 `aud:'admin'`.
  - **Challenge**: `admin:challenge:{token}` Redis TTL 5m, consume-on-read. refresh rotation + reuse detection 동일 패턴.
  - **`GET /api/admin/audit-logs`**: `actorType/actorUserId/adminUserId/action/targetType/targetId/from/to` 필터 + `limit` 1..200 + `cursor=id` 페이지네이션(`take limit+1` 로 hasNext 판정).
  - **seed**: `ADMIN_SEED_{USERNAME,EMAIL,PASSWORD}` env 지원, `totpSecret=null` 로 생성.
  - **스모크 (전부 통과)**: 잘못된 비밀번호 401 → 정상 로그인 `ENROLL_REQUIRED`(qrDataUrl 포함) → `otpauthUrl`의 secret 으로 TOTP 생성 → `/totp/enroll` 200(accessToken + backupCodes 10) → `/me` 200(`SUPER_ADMIN`) → `/audit-logs?limit=3` 200(3건 + nextCursor) → `?action=ORDER_CREATE` 필터 정확 → 비인증 401 → refresh 200 → logout 204 → 재 refresh 401.
  - 상세: [backend/admin/PROGRESS.md](backend/admin/PROGRESS.md#2026-04-22), [backend/audit-log/PROGRESS.md](backend/audit-log/PROGRESS.md#2026-04-22).
  - **다음**: 관리자 웹 (`apps/admin`) 로그인/TOTP/감사로그 페이지 연결, 환불/부분취소, 역할별 라우트 가드, 관리자 쿠지/재고/주문 관리 API.

- **관리자 웹 (`apps/admin`) 로그인 / TOTP / 감사로그 페이지 연결 완료**.
  - **프록시**: `apps/admin/next.config.mjs` 에 `/api/:path*` → 백엔드(4000) rewrite. 같은 origin이라 CORS 불필요, `lucky_admin_rt` HttpOnly 쿠키(Path=`/api/admin`)가 자연스럽게 전달.
  - **`app/lib/api.ts`**: 사용자 앱과 분리된 admin 변형. `sessionStorage[lucky_admin_at]` access token + 401 시 `/api/admin/auth/refresh` 1회 재시도 + 응답에 `accessToken` 있으면 자동 저장.
  - **레이아웃**: `app/providers.tsx` 에 Antd `ConfigProvider` + `App` 래핑. `app/(admin)/layout.tsx` 에 사이드바(대시보드/감사로그) + 헤더(`/me` 표시 + 로그아웃) + 마운트 시 `/api/admin/auth/me` 호출해 401 → `/login` 리다이렉트로 라우트 가드.
  - **로그인 페이지**: 3단계 상태머신 — `login` → 백엔드 응답 stage 분기(`ENROLL_REQUIRED` 면 QR + otpauthUrl 표시 후 `/totp/enroll`, 백업코드 1회 노출 / `TOTP_REQUIRED` 면 TOTP/백업코드 탭으로 `/totp/verify`·`/backup-code`).
  - **감사 로그 페이지**: 필터(actorType / action / targetType / targetId / actorUserId / adminUserId / 날짜 범위) + 커서 페이지네이션(이전/다음 — `cursorStack` 으로 이전 이력 보관) + Antd Table(actorType 색상 태그, IP/Metadata, copyable ID).
  - **의존성**: `dayjs` 명시 추가(antd 가 transitive 로 가져오지만 TS 타입 해석을 위해).
  - **스모크 (프록시 + 로그인)**: backend(4000) + admin(3001) 동시 기동 → `POST /api/admin/auth/login`(root/AdminPass1!) 프록시 경유 200 `{stage:"TOTP_REQUIRED", challengeToken}` 수신 확인. 백엔드 admin-auth API 자체는 2026-04-22 항목에서 이미 종단 검증됨. 6 패키지 typecheck 전부 통과.
  - 상세: [frontend/admin/PROGRESS.md](frontend/admin/PROGRESS.md#2026-04-22).
  - **다음**: 환불/부분취소 정책 재결정 + API/UI, 관리자 쿠지/재고/주문 관리 API + UI, 배송 상태 PATCH(관리자), 공지/문의 도메인.

- **결제 즉시 자동 추첨으로 전환 완료** — `Order.PAID` 상태 잔류 가능성 제거.
  - **결정 배경**: 사용자가 PAID 상태로 티켓을 묵혀두는 시나리오(완매 직전 또는 직후 미추첨)에서 라스트원 트리거·재고·회계 처리가 모두 복잡해짐. 일본 一番くじONLINE / HUSHCRAZE / 한국 굿즈 뽑기 사이트 등 업계 대다수가 「결제 = 자동 추첨」 모델 — 우리도 동일하게 정렬.
  - **변경**: `PaymentService` 에 `DrawService` 주입(`PaymentModule.imports += DrawModule`) → confirm/webhook 두 경로의 PAID 전이 직후 별도 트랜잭션으로 `draw.execute(userId, orderId, ctx)` 호출(`autoDraw` 헬퍼).
    - 별도 tx로 분리한 이유: draw 자체가 `$transaction(15s, ReadCommitted) + Order FOR UPDATE` 라 confirm tx 내부에 중첩하면 Prisma interactive tx 제약 위반.
    - 추첨 실패는 결제 응답을 깨뜨리지 않음 — Order는 PAID 잔류, Logger warn + `POST /orders/:id/draw` 비상 재시도 경로 유지.
  - **응답 호환**: confirm 응답에 `drawResults: { orderId, ticketCount, results } | null` 옵셔널 필드 추가. 이미 PAID/DRAWN 인 멱등 재호출 경로(P2002 fallback 포함)에서도 동일하게 채워서 반환.
  - **webhook 단독 확정 경로**: client confirm 누락된 사용자도 webhook이 들어오면 자동 추첨까지 진행 — 사용자가 다시 들어와 클릭할 필요 없음. 추첨 actor는 order owner userId(audit log `DRAW_EXECUTE` actorType=USER 유지, PAYMENT_WEBHOOK_CONFIRM 은 SYSTEM 으로 분리 기록).
  - **프런트**: `apps/user/app/payment/success/page.tsx` 의 confirm 호출 응답에서 `drawResults` 우선 사용 → 1회 라운드트립으로 결과 화면. 누락 시(또는 mock 분기) `POST /orders/:id/draw` 멱등 fallback 유지(DRAWN 이면 기존 결과 그대로 반환).
  - **스모크 (mock provider, 전부 통과)**: signup → login → order(2장) → intent → confirm 200 — 응답에 `drawResults.results` 2건(B상×2) 포함 + Order `status=DRAWN` 즉시 확정 + audit log `ORDER_CREATE / PAYMENT_CONFIRM / DRAW_EXECUTE` 정확히 3건. 별도 계정으로 `POST /orders/:id/draw` 재호출 → 동일 tier 반환(멱등) + audit log 추가 안 됨 / `GET /orders/:id/draws` → 동일 결과. 6 패키지 typecheck 전부 통과.
  - **부수 효과**: 향후 환불 코드에서 PAID 환불 분기는 사실상 사문화(0초 미만으로 PAID 상태 유지) — DRAWN 환불 한 종류로 단순화 가능. 다만 webhook 지연/auto-draw 실패 케이스 대비 PAID 환불 코드는 보존.
  - 상세: [backend/payment/PROGRESS.md](backend/payment/PROGRESS.md#2026-04-22), [backend/draw/PROGRESS.md](backend/draw/PROGRESS.md#2026-04-22).
  - **다음**: 환불 정책 확정 + `POST /api/admin/orders/:id/refund` (PAID/DRAWN 분기) + 관리자 UI(주문 검색 + 환불 모달).

- **환불 정책 확정 + 관리자 환불 API MVP 완료** — `POST /api/admin/orders/:orderId/refund`.
  - **정책 결정**: (1) `PENDING_PAYMENT` 사용자 self-cancel 유지 / (2) `PAID`·`DRAWN` 은 관리자 수동 환불만(하자·오배송·중복결제 등 예외 케이스 한정) / (3) **소프트 환불** — 재고·`DrawResult`·`KujiEvent.soldTickets` 원복하지 않음(라스트원 트리거·감사 재현성·발송 일관성 보존, 회계 정합성은 리포트로 해소) / (4) 부분 환불 미지원, 전액만 / (5) `Shipment.status` 가 `PENDING` 이 아니면(=발송 시작) 거부 / (6) 약관·상품 페이지에 "추첨 후 단순변심 불가" 고지(프런트 작업 예정).
  - **스키마**: `Payment.refundReason`·`refundedByAdminId` 컬럼 추가(FK는 생략, AuditLog 가 trail 책임). `ShipmentStatus` enum 에 `CANCELLED` 추가. 마이그레이션 `20260422055248_admin_refund` 적용.
  - **PaymentProvider 확장**: `refund({providerTxId, amount, reason})` 메서드 추가. **Mock**: 즉시 성공 반환. **Toss**: `POST /v1/payments/{paymentKey}/cancel` Basic auth + `Idempotency-Key: refund_{paymentKey}` + `cancelReason`, 응답 `status==CANCELED|PARTIAL_CANCELED` 검증, `cancels[].canceledAt` 추출.
  - **`refundByAdmin` 트랜잭션 순서**: (a) Order/Payment/Shipment 사전 검증(상태·shipment PENDING·providerTxId 존재) → (b) **PG refund 외부 호출(트랜잭션 밖)** — 실패 시 DB 무변경으로 안전, 성공 시 (c) DB tx 진입: Order `FOR UPDATE` → Payment `REFUNDED` + refundReason/Admin/refundedAt + 기존 rawResponse 에 `refund` 키 머지 → Order `REFUNDED` → Shipment `CANCELLED` → AuditLog `PAYMENT_REFUND`(actorType=ADMIN, metadata 에 amount/reason/previousOrderStatus/provider/providerTxId/shipmentCancelled). DB tx 실패 시 `Logger.error('REFUND_DB_INCONSISTENCY ...')` 로 운영자 수기 정합성 복구 신호.
  - **컨트롤러**: `AdminOrderController` 신설 — `@UseGuards(AdminJwtAuthGuard)` + `RefundOrderDto({reason: 2..500자})`. PaymentModule 에 `AdminAuthModule` import 추가, `AdminAuthModule.exports` 에 `AdminJwtService` 추가(가드의 의존성 해소).
  - **스모크 (mock provider, 전부 통과)**: signup → login → order(2장, A+B 당첨, Order=DRAWN, Shipment=PENDING) → admin login(root + TOTP) → `POST /admin/orders/:id/refund 200` — Order `DRAWN→REFUNDED` / Payment `PAID→REFUNDED` (`refundReason`·`refundedByAdminId` 기록) / Shipment `PENDING→CANCELLED` / Inventory **불변**(A=3, B=9, LAST=1) / DrawResult 2건 **보존** / 재환불 409 `cannot refund order in state: REFUNDED` / AuditLog `PAYMENT_REFUND` 1건(actorType=ADMIN, metadata 전부 채워짐).
  - 상세: [backend/payment/PROGRESS.md](backend/payment/PROGRESS.md#2026-04-22-환불), [backend/admin/PROGRESS.md](backend/admin/PROGRESS.md#2026-04-22-환불).
  - **다음**: 관리자 웹 주문 검색 페이지 + 환불 모달(2단 확인), 사용자 웹/체크아웃에 "추첨 후 단순변심 불가" 고지, `GET /api/admin/orders` (필터/페이지네이션) — 관리자 UI 의존.

### 2026-04-23
- **관리자 웹 주문 관리 + 환불 모달 UI 완료** — 2026-04-22 "다음" 항목 해제.
  - **백엔드 `AdminOrderController`**: `GET /api/admin/orders` (status·userId·kujiEventId·orderId·from·to 필터, `cursor` 기반 페이지네이션, `take limit+1` hasNext 판정) + `GET /api/admin/orders/:orderId` (user/kujiEvent/payment/shipment/drawResults with prizeTier·prizeItem join) + `POST /api/admin/orders/:orderId/refund` (기존 `refundByAdmin` 위임). 전부 `AdminJwtAuthGuard`.
  - **관리자 프런트 `/orders`**: Antd Form 필터(status Select / orderId·userId·kujiEventId Input / RangePicker) + Antd Table(rowKey=id, createdAt·주문ID(copyable)·쿠지·사용자·수량·금액·상태 태그·결제·배송 컬럼) + `cursorStack` 이전/다음 페이지네이션. 행 클릭/상세 버튼 → `/orders/[id]`.
  - **관리자 프런트 `/orders/[id]`**: 주문/결제/배송/추첨결과 4개 섹션 Descriptions+Table. `canRefund = (PAID|DRAWN) && payment!==REFUNDED && (!shipment || shipment.status==='PENDING')` 에서만 환불 버튼 노출. **2단 확인 모달**: 사유 입력(2~500자, 필수) → "정말 환불하시겠습니까?" confirm(금액·변경 항목·사유 요약). 성공 시 재조회 → Order/Payment/Shipment/감사정보 재반영.
  - **사이드바**: `(admin)/layout.tsx` 에 "주문 관리" 메뉴 추가.
  - **사용자 웹 환불 고지** (`/kujis/[id]`): 결제 버튼 위에 amber 고지 박스(결제=자동추첨·**추첨 후 단순변심 환불 불가**·발송 시작 후 환불 제한) + "동의" 체크박스(필수) → 미체크 시 결제 버튼 disabled.
  - **스모크**: 6 패키지 typecheck 전부 통과. 백엔드 admin-order API 는 2026-04-22 refund 스모크에서 end-to-end 이미 검증됨.
  - 상세: [frontend/admin/PROGRESS.md](frontend/admin/PROGRESS.md#2026-04-23), [frontend/user/PROGRESS.md](frontend/user/PROGRESS.md#2026-04-23), [backend/payment/PROGRESS.md](backend/payment/PROGRESS.md).
  - **다음**: 관리자 쿠지/경품/재고 CRUD API + UI, 배송 상태 PATCH(관리자), 기본 속도 제한(Redis), 공지/문의 도메인.

- **관리자 쿠지/재고 CRUD + 배송 상태 PATCH + 속도 제한 API 사이클 완료** (같은 날 이어서).
  - **`src/rate-limit/`** (Global):
    - `RateLimitGuard` — Redis 고정 윈도우 카운터(`INCR` + 최초 1 일 때만 `EXPIRE`). 키: `rl:{opts.key}:{ip}[|{bodyField}]:{floor(now/windowSec)}`. 초과 시 429 + `Retry-After` 헤더. Redis 장애는 fail-open(Logger warn) — 가용성 우선.
    - `@RateLimit({ key, limit, windowSec, bodyKeyField? })` 메타데이터 데코레이터. `bodyKeyField` 로 email/username 별 한도를 IP 외에 추가 차원으로 묶을 수 있음.
    - **적용 지점**: `POST /auth/signup`(5/hr, IP), `POST /auth/login`(10/5m, IP+email), `POST /admin/auth/login`(10/5m, IP+username), `/admin/auth/totp/{enroll,verify}`, `/admin/auth/backup-code`. 컨트롤러 레벨 `@UseGuards(RateLimitGuard)` + 핸들러 레벨 `@RateLimit(...)` 데코레이터.
  - **`src/kuji/admin-kuji.controller.ts`** (`AdminJwtAuthGuard`):
    - `GET /api/admin/kujis` (status 필터) / `GET /api/admin/kujis/:id` (티어+아이템+재고 join).
    - `POST /api/admin/kujis` — slug kebab-case regex · `saleStartAt < saleEndAt` 검증 · P2002 → `ConflictException('slug already exists')` · 기본 status=DRAFT.
    - `PATCH /api/admin/kujis/:id` — `soldTickets > 0` 이면 `pricePerTicket`·`saleStartAt` 변경 거부(티켓 발행 후 가격 변경 정합성 보호). `saleEndAt`·title·description·coverImageUrl·perUserLimit 은 항상 수정 가능.
    - `PATCH /api/admin/kujis/:id/status` — CLOSED 재개방 거부, ON_SALE 전환 시 티어 최소 1개 강제.
    - `POST /api/admin/kujis/:id/tiers` — **DRAFT/SCHEDULED 에서만**. `$transaction` 으로 `PrizeTier` + `PrizeItem[]` + `Inventory(total=remaining=totalQuantity)` 원자 생성. `isLastPrize=true` 중복 방지. `(kujiEventId, rank)` UNIQUE P2002 → 409.
    - `PATCH /api/admin/kujis/tiers/:tierId` — name·displayOrder·isLastPrize 업데이트(last-prize 중복 방지).
    - `DELETE /api/admin/kujis/tiers/:tierId` — 204. `drawResults` 있으면 409, DRAFT/SCHEDULED 외 상태면 409.
    - `PATCH /api/admin/kujis/tiers/:tierId/inventory` — `{delta, reason}`. `$transaction` 내부에서 `Inventory.total+delta`, `remaining+delta` 동시 조정, `version++`. remaining 음수 → 409, total 음수 → 400. `PrizeTier.totalQuantity` 도 동기화.
    - 모든 mutation 에 `AuditLog` 기록(action: `KUJI_{CREATE,UPDATE,STATUS_UPDATE}` / `TIER_{CREATE,UPDATE,DELETE}` / `INVENTORY_ADJUST`, metadata 에 before/after 스냅샷).
  - **`src/shipment/admin-shipment.controller.ts`** (`AdminJwtAuthGuard`):
    - `GET /api/admin/shipments` (status·trackingNumber 필터, cursor 페이지네이션) + order/user/kuji join.
    - `GET /api/admin/shipments/:id` 상세.
    - `PATCH /api/admin/shipments/:id` — `{status?, carrier?, trackingNumber?}`. **상태 전이 그래프** 적용: PENDING→PREPARING→SHIPPED→IN_TRANSIT→DELIVERED 정방향 + CANCELLED/RETURNED/FAILED 예외 전이만 허용. 역방향 전이는 `ConflictException`. SHIPPED 전이 시 `shippedAt=now` / DELIVERED 전이 시 `deliveredAt=now` 자동 세팅. `SHIPMENT_UPDATE` audit log 기록.
  - **스모크**: Docker/DB 오프라인 상태라 런타임 스모크 생략. **6 패키지 typecheck 전부 통과**(백엔드 새 컨트롤러 + DTO + 가드 + 모듈 등록, admin/user 앱 영향 없음 확인). 실제 호출 검증은 다음 세션 시작 시 `docker compose up -d` 후 진행 예정.
  - 상세: [backend/kuji/PROGRESS.md](backend/kuji/PROGRESS.md), [backend/shipment/PROGRESS.md](backend/shipment/PROGRESS.md), [backend/admin/PROGRESS.md](backend/admin/PROGRESS.md).
  - **다음**: (1) 런타임 스모크(Docker 재기동 후 kuji 생성→티어 생성→ON_SALE→재고 조정→배송 전이 시퀀스 + rate-limit 초과 429 검증), (2) 관리자 웹 UI 연결(쿠지/티어/재고 관리 페이지, 배송 관리 페이지), (3) 공지/문의 도메인, (4) 에러 로그 수집(Sentry or 자체).

- **관리자 웹 쿠지·배송 관리 UI 완료** (같은 날 이어서). 위 "다음" 항목 (2) 해제.
  - **사이드바**: `(admin)/layout.tsx` 메뉴에 "쿠지 관리"(`/kujis`), "배송 관리"(`/shipments`) 추가.
  - **`/shipments`**: status·trackingNumber 필터 + cursor 페이지네이션 Antd Table(수령인·주소·상태·택배사·운송장 컬럼). 상태별 색상 태그.
  - **`/shipments/[id]`**: 배송/주문 2개 섹션 Descriptions + "상태/운송장 수정" 버튼 → Modal. **전이 가능한 상태만 Select 옵션으로 표시**(백엔드 ALLOWED_TRANSITIONS 테이블을 프런트에도 복제해 조기 차단). 종료 상태(DELIVERED/CANCELLED/RETURNED/FAILED)에서는 status Select 비활성화 + 운송장 수정만 허용. 저장 시 `PATCH /api/admin/shipments/:id` 로 변경분만 전송 후 재조회.
  - **`/kujis`**: status 필터 Select + Antd Table(slug·제목·상태·가격·판매량·판매기간) + "신규 쿠지" 버튼.
  - **`/kujis/new`**: 생성 폼 — slug kebab regex 검증, 장당가격·총 티켓·1인한도·판매 RangePicker. 생성 성공 시 `/kujis/[id]` 로 자동 이동 + 티어 추가 안내 toast.
  - **`/kujis/[id]`**: 쿠지 정보(Descriptions) + 티어 테이블(rank·이름·재고·상품·조정/삭제 버튼) + 4종 모달:
    - **쿠지 수정**: `soldTickets>0` 이면 `pricePerTicket`·`saleStartAt` 필드 disabled(백엔드 정합성 규칙을 UI 에도 반영).
    - **상태 변경**: 현재 상태 제외한 옵션만 Select. ON_SALE·CLOSED 주의 안내.
    - **티어 추가**: rank·이름·totalQuantity·displayOrder·isLastPrize 체크박스·대표 상품명(선택). DRAFT/SCHEDULED 에서만 버튼 노출(그 외는 "추가 불가" 안내).
    - **재고 조정**: 현재 total/remaining 표시 + delta(음수 허용)·사유(2~500자) → `PATCH /admin/kujis/tiers/:tierId/inventory`.
    - 티어 삭제는 Popconfirm 으로 2단 확인.
  - **검증**: 6 패키지 typecheck 전부 통과. 런타임 스모크는 Docker 재기동 후 예정.
  - 상세: [frontend/admin/PROGRESS.md](frontend/admin/PROGRESS.md#2026-04-23-ui).
  - **다음**: (1) 런타임 스모크(kuji 생성→ON_SALE→주문/결제/추첨→배송 전이 end-to-end), (2) 공지/문의 도메인(backend + frontend), (3) 에러 로그 수집.

### 2026-04-24
- **배너 모듈 + 사이트 설정(킬스위치) + 추첨 연출 애니메이션 4종 완료** — UI 풍부화 + 이벤트 운영 기반.
- **스키마** (`20260424_banner_siteconfig_animation`):
  - `Banner { placement(enum MAIN_HERO|MAIN_SIDE|KUJI_DETAIL_TOP|POPUP), title, body?, imageUrl?, linkUrl?, priority, isActive, startAt?, endAt? }` + `(placement, isActive, priority)` / `(placement, startAt, endAt)` 인덱스.
  - `SiteConfig { key @id, value Json, updatedAt }` — 전역 모듈 on/off 및 단순 설정값.
  - `PrizeTier.animationPreset String?` — 티어별 연출 프리셋(null 이면 rank 기반 자동).
- **백엔드**:
  - 공개: `GET /api/banners?placement=X` (isActive + 기간 윈도우 + **`banner.enabled` 킬스위치**), `GET /api/site-config/public` (모든 키 노출 — 민감 설정은 저장 금지).
  - 관리자: `GET/POST/PATCH/DELETE /api/admin/banners`, `GET /api/admin/site-config`, `PUT /api/admin/site-config/:key`. 모든 mutation → `BANNER_{CREATE,UPDATE,DELETE}` / `SITE_CONFIG_UPDATE` audit log.
  - `DrawService` 가 티어 조회 SQL 에 `animationPreset` 컬럼 포함, 결과 객체에 전달 → confirm/draw 응답에 티켓별 `animationPreset` 포함.
  - `admin-kuji`: 티어 생성·수정 DTO 에 `animationPreset` 필드 추가 (null → 자동 매핑).
- **관리자 UI**:
  - 사이드바 "배너 관리", "사이트 설정" 메뉴 추가.
  - `/banners`: 플레이스먼트 필터, Antd Table(이미지 썸네일, **행별 on/off Switch 즉시 토글**, 우선순위, 기간). 편집 모달(위치·제목·본문·이미지URL·링크URL·우선순위·기간 RangePicker·isActive).
  - `/settings`: `banner.enabled`, `draw.animation.enabled` 두 개 Switch 카드. `PUT /api/admin/site-config/:key`.
  - `/kujis/[id]`: 티어 생성 모달에 "추첨 연출 프리셋" Select 추가, 신규 **티어 편집 모달**(이름·표시순·isLastPrize·animationPreset 수정). 티어 테이블에 "연출" 컬럼(preset 태그 또는 "자동").
- **사용자 UI**:
  - `apps/user/app/components/Banners.tsx` 에 4개 컴포넌트 통합:
    - `HeroBanner` — 메인 상단, 3.5초 자동 전환 슬라이더(도트 네비). 이미지 없으면 그라디언트 폴백.
    - `SideBanner` — 메인 `grid md:grid-cols-[1fr_260px]` 오른쪽 팸플릿 위젯.
    - `KujiTopBanner` — 쿠지 상세 상단 얇은 amber 띠 (1건만).
    - `PopupBanner` — 첫 방문 모달, **localStorage 로 24시간 snooze**.
  - 모든 컴포넌트: 배너 없으면 render null (= `banner.enabled=false` 로 API 가 `[]` 반환 시 자연 숨김).
  - 메인(`app/page.tsx`) 레이아웃을 `max-w-6xl` + 2컬럼 그리드로 확장, 카드 hover shadow 등 살짝 정돈.
- **추첨 연출 애니메이션**:
  - `apps/user/app/components/DrawAnimations.tsx` — 4종 프리셋:
    - `simple` — 페이드 + slide-up
    - `flip` — Y축 rotate(`preserve-3d` + `backfaceVisibility`)로 카드 뒤집기, 뒷면 "?" 표시
    - `slot` — 슬롯머신 스크롤 1.2s 후 결과에 정지(더미 라벨 7개 + 실 결과)
    - `confetti` — 페이드와 함께 24개 파티클을 방사형으로 날림(순수 CSS keyframe, canvas 불필요)
  - **rank 기반 기본 매핑**(preset null 일 때): LAST/S → confetti, A → slot, B/C → flip, 그 외 → simple.
  - 순차 공개: 티켓별 250ms 간격 delay.
  - 결제 성공 페이지가 `GET /api/site-config/public` 의 `draw.animation.enabled` 를 확인 — **false 면 애니메이션 없이 기존 텍스트 리스트로 폴백**. 관리자가 한 토글로 전체 끌 수 있음.
- **스모크**:
  - 6 패키지 typecheck 전부 통과.
  - 백엔드 재시작 후 `GET /api/banners?placement=MAIN_HERO` → `[]`, `GET /api/site-config/public` → `{}` 확인 (배너/설정이 비어있을 때 정상 동작).
  - Nest 부팅 로그에 `BannerController`, `AdminBannerController`, `PublicSiteConfigController`, `AdminSiteConfigController` 라우트 정상 등록 확인.
- **관리자가 바로 할 수 있는 것**:
  - `/banners` 에서 MAIN_HERO 이미지 URL 넣고 저장 → 사용자 메인에 슬라이더 노출.
  - `/settings` 에서 `banner.enabled=false` 토글 → 모든 배너 즉시 숨김.
  - `/kujis/[id]` 에서 티어마다 프리셋 선택 → S상은 confetti, 일반상은 flip 등.
  - `draw.animation.enabled=false` 토글 → 연출 없이 텍스트 리스트로.

<!-- 이후 진행 내역을 아래에 이어 붙여주세요 -->
