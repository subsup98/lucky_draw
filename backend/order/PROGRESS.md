# backend/order / PROGRESS.md

주문 도메인 진행 로그.

> 참조 문서: `api.md`(§5, §8), `architecture.md`(§3.1), `policy.md`.

---

## 설계 (확정: 2026-04-17)

### 주문 상태 머신
```
PENDING → PAID → DRAWN → FULFILLED
              ↘ REFUNDED
              ↘ FAILED
```
- 전이는 DB 트랜잭션 + `SELECT ... FOR UPDATE`.
- 무효 전이 거부(예: `DRAWN → PAID`).
- `order_events` append-only 이벤트 로그(감사용).

### Idempotency
- `POST /orders`에 `Idempotency-Key` 헤더 **의무**.
- 같은 키 재요청 시 최초 응답 그대로 반환(24h TTL).

### 동시성
- 재고 차감·추첨·주문 상태 변경을 **단일 트랜잭션**으로 묶음.
- Redis 재고 카운터에서 1차 차감 → 트랜잭션 커밋 시 DB 동기화.
- 실패 시 Redis 카운터 복원.

---

## 체크리스트
- [x] POST /orders (Idempotency-Key + `KujiEvent.soldTickets` CAS)
- [x] GET /orders/{orderId} (본인 한정)
- [x] GET /orders (내 주문 목록, 50건)
- [x] POST /orders/{orderId}/cancel (PENDING_PAYMENT → CANCELLED + 재고 원복)
- [x] 주문 상태 머신 1차(PENDING_PAYMENT → CANCELLED) 무효 전이 거부
- [ ] GET /admin/orders
- [ ] PENDING_PAYMENT → PAID → DRAWN 전이 (Payment/Draw 도메인에서)
- [ ] order_events append-only 로그 (2차)
- [ ] Redis 재고 카운터 1차 차감 layer (2차 — 오픈런 스파이크 대응)
- [ ] 결제 실패 시 재고 복원 훅 (Payment 도메인 연동)

---

## 변경 로그

### 2026-04-17
- 주문 상태 머신 확정. Idempotency-Key 의무화.
- Redis 재고 카운터 + DB 트랜잭션 조합으로 동시성 정합성 확보.

### 2026-04-20
- **Order 도메인 MVP 완료** — `POST/GET /api/orders`, `POST /api/orders/:id/cancel`.
- **멱등성(Idempotency-Key)**
  - 헤더 필수, 정규식 `[A-Za-z0-9_\-]{16,128}`.
  - 2단 방어:
    1. Redis 캐시(`idemp:orders:{uid}:{key}`, TTL 24h) — 최초 응답 바디·HTTP 상태 그대로 재반환.
    2. DB `Order.idempotencyKey` UNIQUE — 캐시 만료 후에도 정합성 유지. P2002 발생 시 기 저장된 주문으로 복구.
  - 동시 요청 락(`idemp:orders:lock:…`, `SET NX EX 30`) — 동일 키 병렬 요청은 409 반환.
  - 타 사용자의 키 재사용은 `ConflictException` 으로 거부.
- **재고 CAS**
  - `UPDATE KujiEvent SET soldTickets = soldTickets + :n WHERE status = 'ON_SALE' AND saleStartAt <= now AND saleEndAt >= now AND soldTickets + :n <= totalTickets`.
  - affected rows == 0 → 원인 재조회 후 `NotFound / BadRequest(상태·기간) / Conflict(out of stock)` 구체화.
  - `PrizeTier.Inventory`는 추첨 단계에서 차감(티켓 구매 시점엔 이벤트 레벨만).
- **perUserLimit**
  - 동일 사용자의 활성 주문(`status NOT IN (CANCELLED, FAILED, REFUNDED)`) 합산 + 이번 요청 `ticketCount` 가 한도를 넘으면 400.
- **배송지 스냅샷**
  - DTO(`ShippingAddressDto`) 그대로 `Order.shippingSnapshot` JSON에 저장, `capturedAt` ISO 포함. 이후 `Address` 편집/삭제에 영향받지 않음.
- **주문 취소**
  - 본인 + `PENDING_PAYMENT` 일 때만 허용. 상태 전이는 `WHERE status='PENDING_PAYMENT'` 로 원자 보장.
  - `KujiEvent.soldTickets -= ticketCount` 로 재고 원상복구.
  - PAID 이후는 환불 플로우(Payment 도메인 예정) — 여기선 409.
- **스모크 테스트 결과**
  - 최초 주문 201 / 동일 멱등키 재요청 동일 응답 / perUserLimit 초과 400 / 헤더 누락 400 / 취소 200 → `soldTickets` 0/45 원복 / 재취소 409. 전부 통과.
- **후속 과제**
  - Payment 도메인(토스페이먼츠 Mock) — PaymentIntent 발급, confirm, webhook, `PENDING_PAYMENT → PAID` 전이.
  - Draw 도메인 — 결제 확정 훅에서 추첨 엔진 호출, `Inventory.version` CAS 로 티어별 재고 차감.
  - 오픈런 대비 Redis 카운터 1차 차감 레이어 추가.
