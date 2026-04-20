# backend/shipment / PROGRESS.md

배송 도메인 진행 로그.

> 참조 문서: `api.md`(§6, §8), `policy.md`(배송 정책), `requirements.md`.

## 체크리스트
- [x] GET /me/shipments
- [x] GET /shipments/{shipmentId}
- [ ] PATCH /admin/orders/{orderId}/shipment
- [ ] 택배사 연동(추상화)
- [ ] 배송 상태 전이 정의(PENDING → PREPARING → SHIPPED → IN_TRANSIT → DELIVERED)

## 변경 로그

### 2026-04-20
- **Shipment MVP 완료** — 자동 생성 훅 + 사용자 조회 2종.
- **자동 생성**: `DrawService.execute()` 트랜잭션 내부, `Order` PAID→DRAWN 원자 전이 직후 `ShipmentService.createForOrderInTx(tx, orderId, shippingSnapshot)` 호출.
  - `Order.shippingSnapshot` JSON 을 Shipment 본체 필드(`recipient`·`phone`·`postalCode`·`addressLine1`·`addressLine2`)로 복사해 배송지 이력 불변성 확보(원본 `Address` 이후 수정과 독립).
  - `Shipment.orderId` UNIQUE 로 중복 생성 차단. Draw 멱등 경로(`status=DRAWN` 재호출)는 `loadResults`만 반환하므로 재실행 없음.
  - snapshot 필수 필드 누락 시 `null` 반환하고 Shipment 미생성(현재는 `capturedAt` 있어도 recipient 등이 없으면 skip) — 방어 코드.
- **조회 API**: `GET /me/shipments` (최근 50건, `order.userId = me` 조인 필터), `GET /shipments/:id` (본인 아닌 경우 403).
- **스모크 테스트 통과**:
  1. signup → login → order(2장, 배송지 스냅샷 포함) → intent → confirm(PAID) → draw(B×2)
  2. 자동 Shipment 1건 생성, status=PENDING, 배송지 필드 스냅샷과 동일
  3. `GET /me/shipments` 1건 응답
  4. `GET /shipments/:id` 본인 200 / 타 유저 403 / 비인증 401

### 남은 작업 (다음 사이클)
- 관리자용 `PATCH /admin/orders/{orderId}/shipment` (carrier·trackingNumber·status 수동 업데이트)
- 택배사 API 연동 추상화(CJ대한통운 / 우체국 / 로젠 등)
- 상태 전이 정의·권한 체크(관리자만 SHIPPED 전이 가능 등)
