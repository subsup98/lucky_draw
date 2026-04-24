# frontend/user / PROGRESS.md

사용자 웹/앱 프론트엔드 진행 로그.

> 참조 문서: 루트의 `requirements.md`, `tasks.md`(§2.3), `api.md`(§2~§7).

## 화면별 체크리스트
- [x] 로그인 / 회원가입
- [x] 홈 (쿠지 목록)
- [x] 쿠지 상세 (구매 폼 + 결제 진입)
- [x] 결제 성공 / 실패 콜백 페이지
- [x] 추첨 결과 표시
- [x] 마이페이지 (주문 · 배송 탭)
- [x] 주문 / 배송 조회 (`/orders/[id]` 주문 상세 = 결제+추첨+배송 통합)
- [ ] 공지 / FAQ
- [ ] 배송지 관리

## 결정 사항
- **API 호출 전략**: Next.js `rewrites`로 `/api/:path*` → 백엔드(4000) 프록시. 같은 origin에서 쿠키가 자연스럽게 흐르고 CORS 설정 불필요. `credentials: 'include'` 항상 포함.
- **토큰 관리**: Access token은 메모리(sessionStorage)에 저장, Refresh token은 HttpOnly 쿠키. `api()` 헬퍼가 401 시 `/api/auth/refresh` 1회 재시도 후 원 요청 재호출.
- **Toss SDK 연동**: `@tosspayments/payment-sdk`의 `loadTossPayments(clientKey).requestPayment('카드', {...})` 리다이렉트 방식. `successUrl`에서 `paymentKey/orderId/amount`를 서버 `/api/payments/confirm`으로 재검증 후 바로 `/api/orders/:id/draw` 호출 → 결과 표시.
- **Mock 모드 분기**: `intent.provider === 'mock'`이면 Toss 리다이렉트 없이 클라이언트에서 직접 `POST /confirm`(랜덤 providerTxId) → `/payment/success?mock=1&orderId=...`로 이동.

## 변경 로그
### 2026-04-21
- **사용자 결제/추첨 플로우 MVP 완료** — Next 14 App Router + Toss SDK 연결.
  - 페이지: `/login`, `/`(쿠지 목록), `/kujis/[id]`(상세 + 구매/배송지 폼), `/payment/success`(confirm + 자동 draw + 결과), `/payment/fail`.
  - `app/lib/api.ts`: `credentials:'include'` + Bearer 자동 첨부 + 401 시 refresh-retry + 응답의 `accessToken` 자동 저장.
  - `app/lib/types.ts`: kuji/order/intent/draw 응답 타입.
  - 구매 플로우: `POST /orders`(Idempotency-Key는 `sessionStorage`에 `kujiId:count`로 캐시) → `POST /payments/intent` → provider 분기(toss: `requestPayment` / mock: 직접 confirm) → success 페이지에서 confirm(toss만) → `POST /orders/:id/draw` → 결과.
  - **스모크 테스트 (프록시 경로)**: `POST /api/auth/signup` → `/login`(accessToken 수신, HttpOnly `lucky_rt` 쿠키 전달됨) → `GET /api/kujis` → `POST /api/orders`(Bearer+Idempotency-Key) → 409 `out of stock`(데모 쿠지 45/45 완매, 도메인 응답이므로 인증/프록시/라우팅 전부 정상). 
  - 다음: 관리자 `/admin/audit-logs`, 환불/부분취소.

- **마이페이지 & 주문 상세 완료**.
  - `/me` — 탭 전환(주문/배송). 주문은 `GET /api/orders`, 배송은 `GET /api/me/shipments`. 401 발생 시 `/login`으로 리다이렉트(토큰 만료/비로그인 상태 자동 처리).
  - `/orders/[id]` — 주문 본체 + `GET /api/payments/:id` + `GET /api/orders/:id/draws` + shipments에서 매칭 1건 통합. 결제 전 상태(PENDING_PAYMENT)에서는 취소 버튼 노출 → `POST /api/orders/:id/cancel` 후 재조회.
  - 404(추첨 전·결제 전)는 섹션을 숨기는 식으로 정상 UX로 흡수.
  - 타입체크 6개 패키지 모두 통과.

### 2026-04-22
- **결제 즉시 자동 추첨 — 프런트 단순화**.
  - `app/payment/success/page.tsx`: confirm 응답에 `drawResults` 가 포함되도록 백엔드가 변경됨에 따라, Toss 분기에서 `confirm` 응답의 `drawResults.results` 를 그대로 표시 → `POST /orders/:id/draw` 라운드트립 1회 제거.
  - mock 분기는 confirm 이 kujis 페이지에서 호출되고 redirect 로 success 페이지에 도달하므로, success 페이지에서 `POST /orders/:id/draw` 멱등 호출(이미 DRAWN → 기존 결과 반환)로 결과 수집. 향후 sessionStorage 전달로 한 단계 더 단축 가능.
  - `inlineResults` 가 있으면 즉시 done, 없으면 fallback 으로 `POST /draw` — 자동 추첨 실패 시(서비스 측면에서 거의 발생 안 함)에도 결과 화면이 동작.
  - 6 패키지 typecheck 전부 통과.

### 2026-04-23
- **환불 고지 추가** (`/kujis/[id]`).
  - 결제 버튼 위에 amber 고지 박스: (a) 결제 즉시 자동 추첨, (b) **추첨 후 단순변심 환불 불가** — 하자·오배송·중복결제 등 예외 케이스만 CS 경유 처리, (c) 발송 시작 후 환불 제한.
  - 동의 체크박스(필수). 미체크 시 결제 버튼 disabled.
  - 이유: 관리자 환불 API(소프트 환불, 재고·추첨결과 보존)의 정책을 사용자 UX 에도 명시해 분쟁 소지 차단.
  - 6 패키지 typecheck 전부 통과.
