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

<!-- 이후 진행 내역을 아래에 이어 붙여주세요 -->
