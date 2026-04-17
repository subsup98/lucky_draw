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
- [ ] POST /payments/confirm (Client confirm + PG 재조회)
- [ ] POST /payments/intent (PaymentIntent 발급)
- [ ] POST /webhooks/payment/{provider} (서명 검증 + 독립 처리)
- [ ] 주문 상태 머신 구현 + SELECT FOR UPDATE
- [ ] Idempotency-Key 인터셉터
- [ ] paymentKey UNIQUE 제약
- [ ] 미확정 PENDING 재조회 배치(5분)
- [ ] 환불 처리 흐름
- [ ] 결제 감사 로그
- [ ] Step-up 가드 부착
- [ ] 결제 속도 제한

---

## 변경 로그

### 2026-04-17
- 결제 보안 5개 축 전부 MVP 반영 확정.
- PG는 토스페이먼츠 또는 포트원 중 선정 예정(둘 다 Node SDK 공식 지원).
