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

<!-- 이후 진행 내역을 아래에 이어 붙여주세요 -->
