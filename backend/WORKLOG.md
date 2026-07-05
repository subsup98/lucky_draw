# backend / WORKLOG.md

## 2026-06-25 - 판매 주문 더미 데이터 시드

- 무엇을: 관리자 운영 화면 확인용 판매 상품/주문 더미 데이터 시드를 추가한다.
- 왜: 예약 구매 순차 발송, 송장 입력, 현장 수령, 입금 확인 흐름을 화면에서 즉시 점검하기 위해서다.
- 결과: `apps/backend/prisma/seed-sales-demo.ts`와 `seed:sales-demo` 명령을 추가하고 실행했다. 더미 상품 2개와 더미 주문 8개가 생성됐다.
- 다음 작업: 더미 데이터 삭제/초기화 명령이 필요하면 별도 스크립트로 분리한다.

## 2026-06-25 - 예약 구매 입고 후 순차 발송 대상 API

- 무엇을: 예약 구매 상품의 결제 완료 순번 기준 발송/수령 대상 조회 및 선정 API를 추가한다.
- 왜: 부분 입고 시 관리자가 결제 완료 순서대로 이번 차수 처리 대상을 확정해야 한다.
- 결과: `GET /admin/orders/products/:productId/preorder-fulfillment`, `POST /admin/orders/products/:productId/preorder-fulfillment/select`를 추가했다. `OrderItem.itemStatus`를 활용해 새 DB 마이그레이션 없이 `READY_TO_FULFILL` 상태를 기록한다.
- 다음 작업: 예약 발송 선정 후 송장 일괄 입력/업로드 정책과 연결한다.

## 2026-06-24

- 무엇을: 신규 주문 시스템 기준의 백엔드 역할 문서와 체크리스트를 추가했다.
- 왜: 예약 구매, 일반 판매, 무통장 입금, 송장 입력, 현장 수령, 매출 통계가 여러 도메인에 걸쳐 있어 백엔드 책임 경계를 명확히 해야 한다.
- 결과: 주문/결제/배송/관리자/알림 API 작업 항목을 분리했다.
- 다음 작업: 기존 `order`, `payment`, `shipment` 모듈에서 재사용 가능한 부분과 확장 필요한 부분을 분석한다.

## 2026-06-24 — 배송 상태 전이표 보강

- 무엇을: 관리자 배송 상태 전이표에 `INVOICE_REGISTERED`, `ON_HOLD`를 추가했다.
- 왜: 송장 입력 완료와 실제 택배사 인계 상태를 분리하고, 주소 오류/재고 지연 같은 배송 보류 상태를 표현하기 위해서다.
- 결과: `apps/backend/src/shipment/admin-shipment.controller.ts` 갱신, 백엔드 타입체크 통과.
- 다음 작업: 송장 입력 API에서 `invoiceRegisteredAt` 자동 기록 및 MVP 자동 전환 정책을 구현한다.

## 2026-06-24 — 상품 API 구현

- 무엇을: 신규 `Product` 모델 기반의 사용자/관리자 상품 API를 추가했다.
- 왜: 주문 생성 전에 예약 구매/일반 판매 상품을 등록하고 조회할 수 있어야 하기 때문이다.
- 결과:
  - 사용자 API: `GET /products`, `GET /products/:idOrSlug`.
  - 관리자 API: `GET /admin/products`, `GET /admin/products/:id`, `POST /admin/products`, `PATCH /admin/products/:id`, `PATCH /admin/products/:id/status`, `DELETE /admin/products/:id`.
  - 상품 상태 변경 시 `CLOSED` 재오픈 방지, 판매 시작 전 기본 검증, 주문 존재 시 가격/타입 변경 및 삭제 방지.
  - 감사 로그: `PRODUCT_CREATE`, `PRODUCT_UPDATE`, `PRODUCT_STATUS_UPDATE`, `PRODUCT_DELETE`.
- 검증: `@lucky/backend typecheck`, `@lucky/backend build` 통과.
- 다음 작업: 상품 기반 주문 생성 API와 무통장 입금 접수 흐름 구현.

## 2026-06-24 — 상품 주문 생성/무통장 입금 접수 구현

- 무엇을: `POST /sales-orders` API를 추가해 상품 기반 주문을 생성하고 무통장 입금 대기 결제를 함께 만들도록 했다.
- 왜: 관리자 상품 등록 이후 사용자가 예약 구매/일반 판매 상품을 주문할 수 있어야 하며, MVP 결제 수단은 무통장 입금이 우선이기 때문이다.
- 결과:
  - `Order.kujiEventId`를 선택값으로 변경해 쿠지 주문과 상품 주문을 같은 주문 테이블에서 처리.
## 2026-06-29 — 상품 주문 Mock 결제 구조 보강

- 무엇을: 상품 주문 생성 DTO에 결제 방식(`BANK_TRANSFER`, `CARD`, `KAKAO_PAY`)을 추가하고, 카드/카카오페이는 실제 PG 대신 Mock provider 결제 확정 흐름을 사용하도록 정리했다.
- 왜: 도메인과 실제 PG 연동이 불가능해도 결제 완료 상태 전이, 예약 구매 결제 순번, 배송 준비/현장 수령 알림을 먼저 검증해야 하기 때문이다.
- 결과:
  - 무통장 주문은 기존처럼 `Payment(provider=manual, method=BANK_TRANSFER, WAITING_DEPOSIT)`을 생성한다.
  - Mock 카드/Mock 카카오페이 주문은 결제 intent/confirm 흐름에서 `Payment(provider=mock, method=CARD|KAKAO_PAY, PAID)`로 확정한다.
  - 결제 확정 공통 후처리 `applyPaidOrderEffects`를 추가해 PG confirm/webhook/무통장 확인이 모두 예약 구매 `paidSequence`, 택배 `Shipment.PREPARING`, 사용자 결제 완료/현장 수령 대기 알림을 동일하게 처리한다.
- 다음 작업: 실제 PG 연동 시 `PAYMENT_PROVIDER=toss` 기준으로 redirect/webhook 도메인을 등록하고, 실결제 실패/취소 케이스를 보강한다.

OPEN: 실제 카드/카카오페이 승인/실패/취소 동기화는 운영 도메인과 PG 계정 준비 후 진행한다.

  - 상품 주문 생성 시 `Order`, `OrderItem`, `Payment(status=WAITING_DEPOSIT)`, `Shipment` 또는 `Pickup`, `Notification` 생성.
  - 일반 판매 상품은 주문 시 재고를 차감하고, 예약 구매 상품은 `reservationSequence`를 부여.
  - 택배 수령은 배송지 스냅샷 및 `Shipment` 생성, 현장 수령은 `Pickup(WAITING)` 생성.
  - 기존 쿠지 추첨/취소 로직은 `kujiEventId`가 없는 상품 주문을 처리하지 않도록 가드 추가.
- 마이그레이션: `20260624001000_optional_kuji_order` 적용 완료. `migrate status` 최신 상태 확인.
- 검증: `@lucky/backend typecheck`, `@lucky/backend build` 통과.
- 다음 작업: 관리자 무통장 입금 확인 API와 상품별 구매자 현황 API 구현.

## 2026-06-24 — 관리자 입금 확인/구매자 현황 API 구현

- 무엇을: 관리자 무통장 입금 확인 API와 상품별 구매자 상황 시트 API를 추가했다.
- 왜: 운영자가 입금 확인 후 주문을 결제 완료 처리하고, 품목별 구매자/배송/현장 수령 상태를 표 형태로 관리해야 하기 때문이다.
- 결과:
  - `POST /admin/orders/:orderId/deposit/confirm`: 무통장 입금 대기 결제를 `PAID`로 전환, 주문 `PAID` 처리, 택배 주문은 `Shipment.PREPARING`으로 변경.
  - 예약 구매 `OrderItem`에는 결제 완료 순번 `paidSequence` 부여.
  - `GET /admin/orders/products/:productId/buyers`: 상품별 구매자, 결제, 수령 방식, 송장/배송, 현장 수령 상태 조회.
  - 주문 상세 및 상품별 구매자 시트 조회 시 `PrivacyAccessLog` 기록.
  - 사용자 내부 알림 `DEPOSIT_CONFIRMED` 생성.
- 검증: `@lucky/backend typecheck`, `@lucky/backend build` 통과.
- 다음 작업: 관리자 주문자 목록을 신규 상품 주문 필드까지 포함하도록 확장하고 송장 입력 API를 정리한다.

## 2026-06-24 — 관리자 주문 목록/송장 입력 API 정리

- 무엇을: 관리자 주문 목록에 상품 주문 정보를 포함하고, 주문 기준 송장 입력 API를 추가했다.
- 왜: 운영자가 주문자 목록에서 예약/일반 상품, 결제, 수령 방식, 배송 상태를 한 화면에서 확인하고 송장을 바로 입력해야 하기 때문이다.
- 결과:
  - `GET /admin/orders` 응답에 `orderNumber`, `deliveryMethod`, `orderItems`, 결제 상세, 배송/현장 수령 요약 추가.
  - `GET /admin/orders` 필터에 `productId`, `deliveryMethod`, `paymentStatus` 추가.
  - `PATCH /admin/orders/:orderId/shipment` 추가.
  - `carrier + trackingNumber` 입력 시 자동으로 `INVOICE_REGISTERED` 전환 및 `invoiceRegisteredAt` 기록.
  - `SHIPPED`, `DELIVERED`, `ON_HOLD` 등 배송 상태 전이 검증 및 보류 사유 저장.
  - 송장 등록/배송 시작 시 사용자 내부 알림 생성.
- 검증: `@lucky/backend typecheck`, `@lucky/backend build` 통과.
- 다음 작업: 현장 수령 완료 처리 API와 기간/상품별 판매 현황 통계 API 구현.

## 2026-06-24 — 현장 수령 완료/판매 통계 API 구현

- 무엇을: 현장 수령 완료 처리 API와 기간/상품별 판매 통계 API를 추가했다.
- 왜: 운영자가 현장 수령 주문을 완료 처리하고, 일/주/月/연 단위로 품목별 판매량과 매출을 확인해야 하기 때문이다.
- 결과:
  - `POST /admin/orders/:orderId/pickup/complete`: `Pickup.COMPLETED`, `Order.COMPLETED`, `completedAt`, 확인 관리자, 사용자 내부 알림 기록.
  - `OrderStatus.COMPLETED` enum 및 마이그레이션 `20260624002000_order_completed_status` 추가/적용.
  - `GET /admin/orders/stats/sales`: `period=day|week|month|year`, `from`, `to`, `productId` 기준 품목별 수량/매출/입금대기/환불 건수 집계.
- 검증: `migrate status` 최신 상태, `@lucky/backend typecheck`, `@lucky/backend build` 통과.
- 다음 작업: 관리자 화면에서 상품/주문/구매자 시트/통계 API를 연결한다.

## 2026-06-25 — 사용자 주문 조회 응답 보강

- 무엇을: `GET /orders`, `GET /orders/:id` 응답에 상품 주문 표시용 필드를 추가했다.
- 왜: 신규 상품 주문은 쿠지 제목이 없으므로 사용자 주문 내역/상세에서 상품명, 수령 방식, 현장 수령 상태를 표시해야 한다.
- 결과: `OrderService` 조회 응답에 `orderNumber`, `deliveryMethod`, `orderItems`, `pickup` 요약을 포함했다.
- 검증: `corepack pnpm --filter @lucky/backend typecheck` 통과.
- 다음 작업: 상품 주문 취소 시 일반 판매 재고 원복 정책을 검토한다.

## 2026-06-25 — 카드/카카오페이 연동 보류 및 알림 이벤트 발행 구현

- 무엇을: 카드/카카오페이 연동은 도메인 연결 이후 진행하도록 보류 기록하고, 사용자/관리자 알림 이벤트 발행을 내부 `Notification` 큐 기준으로 구현했다.
- 왜: 카드/카카오페이 실연동은 리다이렉트/웹훅 도메인이 확정되어야 검증 가능하고, 운영 알림은 외부 채널 연동 전에도 주문 상태 변경 시점마다 누락 없이 쌓여야 한다.
- 결과:
  - `NotificationService`/`NotificationModule` 추가.
  - 상품 주문 접수 시 사용자 `ORDER_RECEIVED`, `DEPOSIT_REQUESTED`와 관리자 `ISSUE_OCCURRED` 알림 생성.
  - 관리자 입금 확인 시 사용자 `DEPOSIT_CONFIRMED`, `PAYMENT_COMPLETED`, 현장 수령 주문은 `PICKUP_READY` 알림 생성.
  - 송장 등록/배송 시작/배송 완료 시 사용자 `INVOICE_REGISTERED`, `SHIPPING_STARTED`, `SHIPPING_COMPLETED` 알림 생성.
  - 배송 보류 전환 시 관리자 `ISSUE_OCCURRED` 알림 생성.
  - 현장 수령 완료 시 사용자 `PICKUP_COMPLETED` 알림 생성.
- 검증: `corepack pnpm --filter @lucky/backend typecheck` 통과.
- OPEN: 카드/카카오페이 연동 구조 점검과 실제 결제 상태 동기화는 운영 도메인 연결 후 진행한다.
- 다음 작업: 송장 미입력/배송 지연 감지 배치와 알림 발송 채널(SMS/카카오/이메일) 연결을 설계한다.

## 2026-06-25 — 송장 미입력 감지 배치 구현

- 무엇을: 일반 판매 당일 발송 대상 중 송장이 1일 이상 미입력된 주문을 감지하는 배치를 추가했다.
- 왜: 운영자가 15:00 이전 결제 완료 주문의 송장 입력을 놓쳤을 때 관리자 이슈 알림으로 잡아야 하기 때문이다.
- 결과:
  - `NotificationMonitorService` 추가.
  - 매시간 `detect-missing-invoices` cron 실행.
  - 조건: 상품 주문(`kujiEventId=null`), 일반 판매 품목 포함, 택배 주문, `PAID`, `Shipment.PREPARING`, 운송장/송장입력시각 없음, 결제시각이 15:00 이전, 결제 후 1일 초과.
  - 같은 주문에 `송장 미입력` 관리자 알림이 이미 `PENDING`이면 중복 생성하지 않음.
- 검증: `corepack pnpm --filter @lucky/backend typecheck` 통과.
- 다음 작업: 배송 지연 판단 기준 확정 후 별도 배송 지연 감지 배치를 추가한다.
