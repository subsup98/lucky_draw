# frontend / PROGRESS.md

프론트엔드 전체(사용자 + 관리자) 진행 상황 요약.
세부 진행 내역은 `user/PROGRESS.md`, `admin/PROGRESS.md`에 기록하고 여기에는 공통 사항만 남긴다.

> 참조 문서: 루트의 `requirements.md`, `architecture.md`(§4.1), `tasks.md`(§2.2, §2.3), `api.md`.

---

## 기술 스택 (확정: 2026-04-17)

### 확정 스택
- **프레임워크**: **Next.js (App Router) + TypeScript**
- **스타일**: **Tailwind CSS**
- **UI 라이브러리**
  - 사용자 웹: **shadcn/ui** (Tailwind 기반, 커스터마이징 자유)
  - 관리자 웹: **Ant Design** (테이블·폼·필터 내장으로 개발 속도 확보)
- **서버 상태**: **TanStack Query**
- **클라이언트 상태**: **Zustand**
- **폼 / 검증**: **React Hook Form + Zod** (Zod 스키마를 백엔드 NestJS와 공유)
- **모노레포**: **pnpm workspace + Turborepo** — `apps/user`, `apps/admin`, `apps/backend`, `packages/ui`, `packages/api-types`, `packages/schemas`

### 선택 이유

#### 1. 왜 Next.js (App Router)인가
- **백엔드(NestJS)와 TypeScript 공유** → DTO·Zod 스키마를 `packages/schemas`로 묶어 양쪽에서 import. API 계약 어긋남이 구조적으로 차단됨.
- **SSR / SSG / ISR 혼용** — 쿠지 목록·상세는 SEO가 필요해 SSG/ISR, 마이페이지·추첨 결과는 인증 기반 SSR/CSR. App Router가 화면 단위로 자연스럽게 섞음.
- **이미지 최적화 내장** — 경품 이미지가 많은 특성상 `next/image`의 자동 리사이즈·캐시·CDN 연동이 즉시 이득.
- **오픈런 스파이크 방어 2중** — 정적 페이지는 CDN 캐시로 흡수, 동적 API만 백엔드로. 백엔드 Redis 캐시 + Next ISR이 결합돼 피크 흡수력 향상.
- **앱 확장(`requirements.md` §3)** — 추후 React Native 전환 시 컴포넌트 로직 상당수 재사용 가능.

#### 2. 왜 shadcn/ui(사용자) + Ant Design(관리자) 조합인가
- **사용자 웹은 브랜드 UI가 상품성에 직결** → Tailwind + shadcn/ui로 자유 커스터마이징. 결제·추첨 연출 화면을 원하는 대로 구현.
- **관리자 웹은 기능 밀도가 관건** → Ant Design의 Table, Form, DatePicker, Filter가 내장돼 쿠지·재고·주문·감사 로그 화면 개발 속도 2~3배.
- 같은 UI 라이브러리로 통일하면 관리자 개발 속도가 현저히 느려짐 → 분리가 합리적.

#### 3. 왜 모노레포(pnpm + Turborepo)인가
- 백엔드와 `api-types` / `schemas` / `ui` 패키지를 공유해야 함.
- Turborepo의 빌드 캐시로 CI 시간 단축.
- 저장소가 하나라 API 변경 → 프론트 반영이 한 PR로 처리됨.

### 기각된 대안
| 스택 | 기각 이유 |
|---|---|
| **Vite + React (SPA)** | SEO 약함 — 쿠지 상세 SNS 공유 유입에 불리. 이미지 최적화 직접 설정 부담. |
| **Remix** | 한국어 자료·국내 레퍼런스 부족. ISR·이미지 최적화 별도 구성. |
| **SvelteKit** | React 생태계 밖이라 결제사 SDK·관리자 UI 라이브러리 부족. React Native 전환 시 사실상 재작성. |

---

## 공통 체크리스트
- [ ] 모노레포 초기화 (pnpm + Turborepo)
- [ ] `packages/schemas` — Zod 스키마 공유 패키지
- [ ] `packages/api-types` — API 응답 타입 공유
- [ ] `packages/ui` — 공통 컴포넌트(버튼·인풋 등)
- [ ] 공통 API 클라이언트 레이어 (fetch 래퍼 + 인증 헤더 자동 주입)
- [ ] 인증 토큰 처리 및 권한 라우팅 (아래 §인증 참조)
- [ ] 에러/로딩 UX 공통 규칙
- [ ] 디자인 토큰 공유 (컬러·타이포)
- [ ] i18n 구조(2차) 준비

---

## 인증 (프론트엔드 관점)

상세 설계는 [backend/auth/PROGRESS.md](../backend/auth/PROGRESS.md) 참조. 여기서는 프론트 구현 관점만 요약.

### 토큰 저장 전략
- **Access Token (JWT, 15분)**: **메모리(Zustand store)에 저장**. `localStorage` 사용 금지 — XSS 탈취 리스크.
- **Refresh Token (14일)**: **서버가 `HttpOnly; Secure; SameSite=Lax` 쿠키로 설정**. JS에서 접근 불가 → XSS로 탈취 불가.

### 요청 흐름
1. 로그인 성공 시 응답 body의 access token을 메모리에 저장, refresh는 쿠키로 자동 저장됨.
2. 모든 API 요청에 `Authorization: Bearer <access>` 헤더 자동 주입 (axios/fetch 인터셉터).
3. 401 응답 시 자동으로 `/auth/refresh` 호출 → 새 access 받아 원래 요청 재시도.
4. refresh 실패 시 로그인 페이지로 리다이렉트.

### 탭 간 세션 동기화
- refresh 쿠키는 브라우저 공유 → 새 탭에서도 자동 로그인.
- **`BroadcastChannel` API**로 로그아웃·토큰 갱신 이벤트를 탭 간 공유.

### 라우팅 보호
- Next.js **middleware**에서 refresh 쿠키 존재 여부로 인증 경로 차단.
- 세부 권한(일반/운영자/슈퍼관리자)은 서버 컴포넌트에서 `/me` 응답으로 재확인.

### 관리자 웹 추가 사항
- 관리자 로그인은 **별도 도메인/경로**(`admin.example.com` 또는 `/admin`)로 분리.
- 관리자 refresh 쿠키는 `Path=/admin`으로 제한해 사용자 영역과 격리.
- 민감 작업(쿠지 생성, 재고 변경) 전 **재인증 모달** — 최근 N분 내 재인증 기록이 없으면 비밀번호 재입력.

---

## 변경 로그

### 2026-04-17
- 프론트 스택 확정: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui(사용자) + Ant Design(관리자) + TanStack Query + Zustand + React Hook Form + Zod.
- 모노레포 구성 결정: pnpm workspace + Turborepo.
- 인증 방식 결정: Access(메모리) + Refresh(HttpOnly 쿠키) + Next middleware 라우팅 보호. 상세는 `backend/auth/PROGRESS.md`.
- **스캐폴딩 완료**: `apps/user`(Next 14, 포트 3000, Tailwind), `apps/admin`(Next 14, 포트 3001, Ant Design), 공통 패키지 `@lucky/ui` 연결.
