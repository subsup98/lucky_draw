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
- [ ] POST /orders (Idempotency-Key + Redis 재고 차감)
- [ ] GET /orders/{orderId}
- [ ] GET /admin/orders
- [ ] 주문 상태 머신 (무효 전이 거부)
- [ ] order_events append-only 로그
- [ ] 재고 복원 로직 (결제 실패/취소 시)

---

## 변경 로그

### 2026-04-17
- 주문 상태 머신 확정. Idempotency-Key 의무화.
- Redis 재고 카운터 + DB 트랜잭션 조합으로 동시성 정합성 확보.
