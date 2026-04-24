# backend/payment / PROGRESS.md

결제 도메인 진행 로그.

> 참조 문서: `api.md`(§5), `security.md`(결제 영역), `policy.md`(환불 정책), `architecture.md`.

---

## 결제 보안 설계 (확정: 2026-04-17)

돈이 걸린 엔드포인트라 **중복 결제·결제 누락·재시도 다중 처리 방지**가 최우선. 아래 5개 축을 MVP부터 전부 적용.

### 축 1. Idempotency-Key (필수)
- 주문 생성, 결제 확인, 추첨 실행 엔드포인트에 **`Idempotency-Key` 헤더 의무화**.
- 클라이언트가 UUID v4 생성. 같은 키로 재요청 시 서버는 **최초 응답을 그대로 재반환**(새 처리 없음).
- 저장소: Redis `idem:{method}:{path}:{key} → {status, responseBody}` TTL **24시간**.
- NestJS 인터셉터로 횡단 적용.

### 축 2. 주문 상태 머신
```
PENDING → PAID → DRAWN → FULFILLED
              ↘ REFUNDED
              ↘ FAILED
```
- 전이는 **DB 트랜잭션 + `SELECT ... FOR UPDATE`**로 원자화.
- 유효하지 않은 전이(예: `DRAWN → PAID`)는 에러.
- 상태 변경은 `order_events` 테이블에 append-only 로그.

### 축 3. PG paymentKey UNIQUE 제약
- `payments` 테이블에 `(pg_provider, payment_key) UNIQUE`.
- DB 레벨 중복 저장 불가 → 애플리케이션 버그 내성.

### 축 4. Client confirm + Webhook 이중 검증
- 클라이언트 `/payments/confirm` 호출 → 서버가 **PG API로 실제 결제 상태 재조회**(클라 값 신뢰 금지).
- PG 웹훅 **독립 수신** → 누락 방지.
- 웹훅 서명 검증(PG 공개키).
- **5분 주기 배치**: 미확정 PENDING 주문 PG 재조회 → 상태 동기화.

### 축 5. PaymentIntent 사전 발급
- 결제 직전 서버가 **PaymentIntent** 발급: `{ intentId, orderId, amount, expiresAt(5m), signature(HMAC) }`.
- 클라이언트는 이 intent로만 PG 호출.
- 금액·상품 위변조 차단, intent 재사용 불가(Redis `intent:{id}` consume once).

---

## 추가 방어
- **Step-up 재인증** — `/payments/confirm` 전에 최근 5분 재인증 필수 (`backend/auth` 참조)
- **속도 제한** — 결제 관련 엔드포인트 계정당 10회/분
- **감사 로그** — 결제 시도·성공·실패·환불 전부 기록(append-only, 위변조 방지)
- **금액 검증** — Intent 서명에 포함된 금액과 PG 응답 금액 일치 확인
- **환불 정책 연동** — `policy.md` 환불 조항 기반으로 자동/수동 구분

---

## 체크리스트
- [x] POST /payments/intent (PaymentIntent 발급, HMAC 서명, Redis 5m TTL)
- [x] POST /payments/confirm (서명 검증 + Order `FOR UPDATE` + 단일 트랜잭션 상태 전이)
- [x] POST /payments/webhook (HMAC 검증 + 멱등, client confirm 누락 대비 webhook-only 경로)
- [x] 주문 상태 머신 `PENDING_PAYMENT → PAID` 전이 + 동시성 보호
- [x] paymentKey UNIQUE 제약 (`Payment.orderId`, `Payment.providerTxId`)
- [x] GET /payments/:orderId (본인 한정)
- [ ] Idempotency-Key 인터셉터 횡단 (현재 Order에만 적용)
- [ ] 미확정 PENDING 재조회 배치(5분)
- [ ] 실제 PG 통합 (토스페이먼츠) — MVP는 mock provider
- [ ] 환불 처리 흐름 (RefundRequested → Refunded)
- [ ] 결제 감사 로그(AuditLog)
- [ ] Step-up 재인증 가드 부착
- [ ] 결제 속도 제한(rate limit)

---

## 변경 로그

### 2026-04-17
- 결제 보안 5개 축 전부 MVP 반영 확정.
- PG는 토스페이먼츠 또는 포트원 중 선정 예정(둘 다 Node SDK 공식 지원).

### 2026-04-20
- **Payment 도메인 MVP 완료 (Mock provider)** — `intent`/`confirm`/`webhook`/`GET`.
- **축 5. PaymentIntent 사전 발급**
  - `POST /api/payments/intent` — 주문 소유·`PENDING_PAYMENT` 검증 후 `pi_<hex>` 발급.
  - 서명: HMAC-SHA256(`intentId.orderId.userId.amount.exp`) with `PAYMENT_INTENT_SECRET`.
  - Redis `pay:intent:{id}` TTL 5m — 만료/소비 시 자동 무효.
- **축 2. 상태 머신 + 축 3. UNIQUE**
  - `POST /api/payments/confirm` — intent Redis 조회 → 서명 `timingSafeEqual` → `SELECT ... FOR UPDATE` 로 Order 락 → `amount` 일치 검증 → `Payment` 생성(`orderId`/`providerTxId` UNIQUE) → Order `WHERE status='PENDING_PAYMENT'` 원자 전이 → intent `DEL`.
  - 이미 PAID 이고 동일 `providerTxId` 면 멱등 응답(P2002 fallback 포함).
- **축 4. Client confirm + Webhook 이중 검증**
  - `POST /api/payments/webhook` — `X-Mock-Signature` 헤더 검증(HMAC `orderId.providerTxId.status`).
  - 동일 `providerTxId` 이미 처리되었으면 `alreadyProcessed:true` 200.
  - client confirm 누락 시 webhook 단독으로도 Payment 생성 + Order 전이. PAID 동시 수신은 P2002 fallback으로 멱등.
  - FAILED/CANCELLED 는 Payment row 없이 Order만 FAILED 전이.
- **스모크 테스트 결과**
  - intent 발급 → confirm 200(Payment PAID, Order PAID) → intent 재사용 400 → 위조 서명 401.
  - 별도 주문에서 webhook 단독 PAID 200 → 재전송 `alreadyProcessed` → 서명 위조 401 → Order PAID 확인. 전부 통과.
- **후속 과제**
  - 환불 플로우, Step-up 가드, 속도 제한, PENDING 재조회 배치.
  - Draw 도메인에서 `PAID → DRAWN` 전이 훅 연결.

### 2026-04-21
- **Provider 추상화 + Toss 어댑터 완료** — `PaymentProvider` 인터페이스 + `MockPaymentProvider` / `TossPaymentProvider` 두 구현, 런타임 선택.
  - **구조**: `payment/providers/payment-provider.ts`(인터페이스·DI 토큰), `mock.provider.ts`(기존 HMAC intent 로직 이관), `toss.provider.ts`(Toss API `POST /v1/payments/confirm` Basic auth 호출).
  - **DI**: `PaymentModule` useFactory — `PAYMENT_PROVIDER=mock|toss` 환경변수로 선택, 부팅 시 선택값 로깅.
  - **흐름**:
    - `createIntent` → `provider.initiate({orderId,userId,amount,orderName})` → `{provider, ...payload}` 반환.
      - mock: `{paymentIntentId, signature, expiresAt}` (기존).
      - toss: `{clientKey, orderId, amount, orderName}` — 프론트 Toss SDK 가 그대로 사용.
    - `confirm(userId, params)` → `provider.confirm` 에서 외부 검증/승인 → 표준 `{providerTxId, amount, method, paidAt, rawResponse}` 로 반환 → DB 트랜잭션으로 Payment 생성 + Order PAID 전이.
      - toss.confirm 은 `Authorization: Basic base64(secretKey:)` 로 Toss 서버에 직접 승인 호출, `status==='DONE'` + `totalAmount` 검증. 네트워크 실패 → 500, PG 거절 → 400(`toss rejected: <code>`).
    - `webhook(rawBody, headers)` → `provider.verifyWebhook` 에서 서명 검증 + 표준 이벤트로 변환 → 기존 webhook 트랜잭션 재사용.
      - toss: `toss-signature` / `x-toss-signature` 헤더의 HMAC-SHA256(body) 검증.
      - mock: `x-mock-signature` 헤더의 HMAC(`orderId.providerTxId.status`).
- **rawBody 활성화** — `NestFactory.create(AppModule, { rawBody: true })`. webhook 서명 검증은 바디 원본 바이트 기준이라야 정확.
- **confirm DTO 완화** — provider마다 필드가 달라 strict DTO 대신 `Record<string,unknown>` 수용, provider 내부에서 필드 검증.
- **E2E 스모크**
  - **mock 회귀**: 2장 주문 → intent(provider=mock) → confirm(200 PAID) → 재confirm(200 PAID 멱등) → draw(B,A) 전부 통과.
  - **toss**: `PAYMENT_PROVIDER=toss` 재기동 후:
    - intent: `{provider:"toss", clientKey:"test_ck_docs_...", orderId, amount, orderName}` 반환 확인.
    - 금액 불일치 confirm: 로컬 400 `amount mismatch`(Toss 호출 전).
    - 위조 paymentKey confirm: 실 Toss sandbox 호출 → 400 `toss rejected: UNAUTHORIZED_KEY`(실제 네트워크 라운드트립 입증).
    - 웹훅 정상(HMAC 서명 유효): 200 Payment PAID row 생성 + Order PAID 전이.
    - 웹훅 replay(동일 body): `alreadyProcessed:true` 200.
    - 위조 서명 / 서명 누락: 401 각각.
- **후속 과제**
  - Toss 실 웹훅 포맷은 이벤트별로 상이(가상계좌 deposit 은 서명 有, 카드는 콜백 검증 방식 별도) — 운영 전환 시 이벤트 타입별 어댑터 세분화 필요.
  - 프런트 Toss SDK 연결(결제창 → successUrl) / 프론트 `paymentKey` 를 confirm 에 전달하는 라우팅.
  - 환불/부분취소 API, 멀티프로바이더 동시 운영(프로바이더 필드를 Order에 기록).

### 2026-04-22
- **결제 즉시 자동 추첨 — confirm/webhook PAID 전이 직후 `DrawService.execute` 자동 호출**.
  - 배경: PAID 상태 잔류(사용자가 추첨 안 누르고 묵혀두는 케이스)는 라스트원 트리거·재고·회계 처리를 모두 복잡하게 만듦. 일본 一番くじONLINE 등 업계 표준이 「결제 = 자동 추첨」 — 동일 모델로 정렬.
  - 변경: `PaymentModule.imports += DrawModule`. `PaymentService` 에 `DrawService` 주입 + `autoDraw(userId, orderId, ctx)` 헬퍼 추가.
  - 트랜잭션 분리: confirm tx 커밋 → 별도 draw tx 실행. 이유: draw 자체가 `$transaction + Order FOR UPDATE` 라 confirm tx 내부에 중첩하면 Prisma interactive tx 제약 위반.
  - 실패 격리: 추첨 예외는 Logger.warn 후 swallow — Order는 PAID 잔류, `POST /orders/:id/draw` 비상 재시도 경로 그대로 유지. 결제 응답을 깨뜨리지 않음.
  - 응답 호환: confirm 응답 구조에 `drawResults: { orderId, ticketCount, results } | null` 옵셔널 추가. 멱등 재호출(이미 PAID/DRAWN, P2002 fallback 포함)도 동일 모양.
  - webhook 단독 확정 경로: client confirm 누락된 사용자도 webhook 수신 시 Order 소유자 userId 조회 후 자동 추첨 → 사용자가 다시 들어와 클릭 안 해도 결과까지 확정. audit log 는 `PAYMENT_WEBHOOK_CONFIRM`(SYSTEM) + `DRAW_EXECUTE`(USER, order owner) 분리 기록.
  - 스모크 (mock provider, 전부 통과): order(2장) → confirm 200 응답에 `drawResults.results` 2건 + Order `status=DRAWN` 즉시 + audit `ORDER_CREATE / PAYMENT_CONFIRM / DRAW_EXECUTE` 정확히 3건. POST `/orders/:id/draw` 재호출 시 동일 결과(멱등) + audit 추가 안 됨.
  - 향후: 환불 코드의 PAID 분기는 사실상 사문화(0초 미만), 보존만. webhook 지연/auto-draw 실패 케이스를 위해 PAID 환불 분기는 유지 필요.
