# frontend/admin / PROGRESS.md

관리자 웹 프론트엔드 진행 로그.

> 참조 문서: 루트의 `requirements.md`, `tasks.md`(§2.3), `api.md`(§8), `security.md`(관리자 권한 항목).

## 화면별 체크리스트
- [x] 관리자 로그인 (login → TOTP enroll/verify → backup code)
- [x] 대시보드 기본 화면 (사이드바 + /me + 로그아웃)
- [ ] 쿠지 목록/생성/수정
- [ ] 경품 등록
- [ ] 재고 관리
- [x] 주문 관리 / 환불 처리 (배송 상태 변경은 추후)
- [x] 감사 로그 조회 (필터 + 커서 페이지네이션)
- [ ] 공지 관리
- [ ] 문의 관리

## 권한 체계
- 일반 운영자 / 슈퍼 관리자 구분 확인 필요.

## 변경 로그

### 2026-04-21
- 관리자 인증 착수 결정 — 비밀번호 + TOTP 2FA 의무, 최초 로그인 시 QR 강제 등록.
- 프런트 스택: Next.js App Router + Ant Design (`apps/admin` 스캐폴딩 완료, 포트 3001). 사용자 앱과 도메인·쿠키·번들 분리.
- 계획 화면: 로그인(username/password) → TOTP 입력 / 최초 1회 QR 등록 → 감사 로그 목록(필터: actor·action·resourceType·날짜범위, 페이지네이션).
- **중단 지점**: 백엔드 admin-auth API 구현 전. `apps/admin/next.config.mjs` 에 `/api/*` rewrites 추가 및 로그인/감사로그 페이지 구현은 API 완성 후 착수.

### 2026-04-22
- **로그인 / TOTP / 감사로그 페이지 MVP 완료** — 2026-04-21 중단 지점 해제.
- **프록시**: `next.config.mjs` 에 `/api/:path*` → `BACKEND_ORIGIN`(기본 `http://localhost:4000`) rewrite. CORS 우회 + HttpOnly admin refresh 쿠키 자연 전달.
- **`app/lib/api.ts`**: 사용자 앱(`apps/user`) 의 패턴을 admin 시크릿 키(`lucky_admin_at` sessionStorage / `/api/admin/auth/refresh`) 로 포팅. 401 발생 시 1회 refresh 후 재시도, 응답 `accessToken` 자동 저장.
- **`app/providers.tsx`** + **`app/layout.tsx`**: Antd v5 `ConfigProvider` + `App` 래핑. App Router 환경에서 동작.
- **`app/(admin)/layout.tsx`**: 사이드바(대시보드 / 감사로그) + 헤더(현재 admin `username`·`role` 표시 + 로그아웃 버튼). 마운트 시 `/api/admin/auth/me` 호출해 401 → `/login` 자동 리다이렉트(라우트 가드 역할).
- **`/login`**: 3단계 상태머신.
  - 1단계: username/password → `POST /api/admin/auth/login` → 응답 `stage` 분기.
  - 2단계 `ENROLL_REQUIRED`: `qrDataUrl` `<img>` 표시 + `otpauthUrl` 복사 가능 텍스트 + 6자리 코드 입력 → `POST /api/admin/auth/totp/enroll` → 백업 코드 10개 1회 노출(이후 다시 표시 안 됨 경고 + `<pre>`).
  - 2단계 `TOTP_REQUIRED`: TOTP / 백업 코드 탭 — 각각 `/totp/verify`, `/backup-code` 호출 후 `/audit-logs` 이동.
- **`/audit-logs`**: 필터 폼(actorType select / action / targetType / targetId / actorUserId / adminUserId / 날짜 범위 RangePicker) + Antd Table.
  - 페이지네이션: 백엔드의 `cursor` 기반 응답을 그대로 활용. `cursorStack` 배열로 이전 페이지 복귀(이전/다음 버튼).
  - 컬럼: 시각(dayjs format) / actorType 태그(ADMIN purple, SYSTEM default, USER blue) / Actor ID(copyable) / Action / Target(`type/id앞8자`) / IP / Metadata(JSON, 툴팁 ellipsis).
- **`/dashboard`**: 임시 카드 + 감사 로그 링크. 향후 통계·관리 메뉴 자리.
- **`/`**: `redirect('/dashboard')` 서버 리다이렉트.
- **의존성**: `dayjs` 명시 추가(antd transitive 이지만 TS 모듈 해석을 위해 직접 의존성 등록).
- **스모크**: backend(4000) + admin(3001) 동시 기동 → admin 프록시 경유 `POST /api/admin/auth/login`(root/AdminPass1!) → 200 `{stage:"TOTP_REQUIRED", challengeToken:"..."}` 수신, 프록시 정상 동작 확인. 6 패키지 typecheck 전부 통과.

### 2026-04-23
- **주문 관리 + 환불 모달 MVP 완료**.
- **`/orders`**: 필터(status / orderId / userId / kujiEventId / 날짜범위) + Antd Table + cursor 페이지네이션(`cursorStack` 으로 이전 페이지 복귀). 사이드바에 "주문 관리" 메뉴 추가.
- **`/orders/[id]`**: 주문·결제·배송·추첨결과 섹션 + 환불 버튼. `canRefund = (PAID|DRAWN) && payment≠REFUNDED && (shipment 없음 || PENDING)` 에서만 노출. 아니면 이유 텍스트("이미 환불됨" / "배송 진행 중 — 환불 불가") 표시.
- **2단 확인 환불 모달**: (1) 사유 입력(2~500자) → (2) Modal.confirm 으로 금액·변경항목·사유 요약 재확인 → `POST /api/admin/orders/:id/refund` → 성공 시 재조회. 소프트 환불 정책(재고/추첨결과 보존) 안내 문구 포함.
- 6 패키지 typecheck 전부 통과.

### 2026-04-23 (ui)
- **쿠지 관리 + 배송 관리 페이지 완료** — 같은 날 백엔드 API 사이클 직후 UI 연결.
- 사이드바 메뉴 확장: 쿠지 관리 / 배송 관리.
- **`/shipments`**: status·trackingNumber 필터 + cursor 페이지네이션. **`/shipments/[id]`**: PATCH 모달에서 허용된 다음 상태만 Select 로 노출(ALLOWED_TRANSITIONS 그래프를 프런트에 복제). 종료 상태에서는 status disabled, 운송장/택배사만 수정 가능.
- **`/kujis`**: status 필터 + 신규 쿠지 버튼. **`/kujis/new`**: slug kebab regex·판매 RangePicker 생성 폼. **`/kujis/[id]`**: 4종 모달 — 쿠지 수정(판매 시작 후 price/saleStartAt 잠김) / 상태 변경 / 티어 추가(isLastPrize 체크박스, 대표 상품명 inline 생성) / 재고 delta 조정(total/remaining 현재값 표시 + 사유 필수). 티어 삭제는 Popconfirm 2단 확인, DRAFT/SCHEDULED 에서만 노출.
- 6 패키지 typecheck 통과.
