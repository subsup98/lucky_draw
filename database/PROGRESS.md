# database / PROGRESS.md

DB 설계/마이그레이션 진행 로그.

> 참조 문서: `architecture.md`(§5, §7), `tasks.md`(§2.5), `security.md`(개인정보 영역).

## 테이블 체크리스트
- [x] User
- [x] Address
- [x] KujiEvent
- [x] PrizeTier
- [x] PrizeItem
- [x] Inventory
- [x] Order
- [x] Payment
- [x] DrawResult
- [x] Shipment
- [x] Notice
- [x] Inquiry
- [x] AdminUser
- [x] AuditLog

## 마이그레이션
- `20260417071244_init_scaffold` — 초기 스캐폴딩 검증용 `ScaffoldPing`.
- `20260420004637_core_entities` — 14개 엔티티 본설계 반영. 9개 enum, 관계·유니크·인덱스 포함. `ScaffoldPing` 제거.

## 의사결정
- **DBMS**: PostgreSQL 16 (트랜잭션·JSONB·행 수준 락 필요).
- **ID 전략**: `cuid()` — 분산 생성 가능·URL-safe·추측 방지.
- **동시성 제어**:
  - 재고 차감은 `Inventory.version` 기반 낙관적 락(CAS). 고경합 구간은 `SELECT ... FOR UPDATE`로 비관적 락 병행 가능.
  - 티켓 단위 중복 추첨 방지: `DrawResult(orderId, ticketIndex)` UNIQUE.
  - 중복 결제 확정 차단: `Payment.orderId` UNIQUE + `Payment.providerTxId` UNIQUE.
  - 주문 생성 멱등성: `Order.idempotencyKey` UNIQUE.
- **개인정보 최소화**: 주문 시점 배송지 스냅샷(`Order.shippingSnapshot`, `Shipment` 본체 필드)을 원본 `Address`와 분리 보관 — 사용자 주소 수정이 과거 주문 이력에 영향 주지 않도록.
- **감사 이력 불변성**: `DrawResult.seed`/`snapshot`으로 추첨 재현성 확보. 운영자 수정 금지 원칙(`security.md` §6.3) 지원.
- **인덱스 전략**: API 조회 패턴 기준 —
  - 판매중 쿠지 탐색: `KujiEvent(status, saleStartAt)`.
  - 유저 주문/추첨 이력: `Order(userId, createdAt)`, `DrawResult(userId, drawnAt)`.
  - 관리자 주문 조회: `Order(status, createdAt)`, `Order(kujiEventId, status)`.
  - 감사 로그: `AuditLog(action, createdAt)`, `(targetType, targetId)`.

## 변경 로그
### 2026-04-17
- Postgres 16 컨테이너 기동 (Docker Compose, 포트 5432).
- Prisma 5.22 초기 설정 완료.
- 첫 마이그레이션 `init_scaffold` 적용: `ScaffoldPing` 테이블(임시 검증용, 다음 단계에서 삭제 예정).

### 2026-04-20
- **Prisma 스키마 본설계 완료** — `architecture.md` §5의 14개 엔티티 + 9개 enum.
- 동시성 제약 6종 반영: `Inventory.version` / `DrawResult(orderId,ticketIndex)` UNIQUE / `Payment.orderId`·`providerTxId` UNIQUE / `Order.idempotencyKey` UNIQUE / `User.email`·`KujiEvent.slug`·`AdminUser.username`·`email` UNIQUE / `PrizeTier(kujiEventId, rank)` UNIQUE.
- 인덱스 14종 설계(판매중 쿠지·유저 이력·관리자 조회·감사 로그 조회 패턴 기준).
- `npx prisma migrate dev --name core_entities` 성공 → `ScaffoldPing` 자동 삭제, Prisma Client 재생성.
- 다음: 백엔드 도메인 모듈에 Prisma 연결, 시드 데이터 작성, 첫 API 엔드포인트(회원가입/로그인) 구현.
