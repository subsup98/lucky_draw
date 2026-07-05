# database / WORKLOG.md

## 2026-06-29 - Mock 결제 진행에 따른 DB 영향 점검

- 무엇을: 상품 주문의 무통장/Mock 카드/Mock 카카오페이 흐름이 기존 DB 모델로 표현 가능한지 점검했다.
- 왜: 실제 PG 연동 전 Mock 결제를 위해 불필요한 마이그레이션을 추가하면 나중에 실결제 전환 시 상태 모델이 복잡해질 수 있기 때문이다.
- 결과: 추가 마이그레이션 없이 `Payment.provider`, `Payment.method`, `Payment.status`, `Order.status`, `OrderItem.paidSequence`, `Shipment.status`, `Pickup.status`로 표현 가능하다.
- 다음 작업: 실제 PG 연동 시 provider별 거래키, 결제수단 상세값, 부분취소 요구사항이 생기면 스키마 확장 여부를 재검토한다.

## 2026-06-25 - 관리자 화면 확인용 판매 더미 데이터

- 무엇을: 예약 구매/일반 판매 상품과 주문 상태별 더미 데이터를 추가한다.
- 왜: 관리자 화면에서 상품, 구매자 시트, 예약 순차 발송, 입금 확인, 배송/현장 수령 상태를 실제 DB 기반으로 확인하기 위해서다.
- 결과: `seed:sales-demo` 스크립트로 예약 상품 1개, 일반 상품 1개, 상태별 더미 주문 8개를 추가했다.
- 다음 작업: 롤백/데이터 보존 전략을 별도로 정리한다.

## 2026-06-24

- 무엇을: 신규 주문 시스템 기준의 DB 역할 문서와 체크리스트를 추가했다.
- 왜: 기존 쿠지 중심 모델에서 예약 구매, 일반 판매, 현장 수령, 무통장 입금, 품목별 구매자 시트를 지원하려면 스키마 차이 분석이 필요하다.
- 결과: `Product`, `OrderItem`, `Pickup`, `Notification`, `PrivacyAccessLog` 검토 항목을 생성했다.
- 다음 작업: `apps/backend/prisma/schema.prisma` 기준으로 신규 요구사항과의 차이 분석을 수행한다.

## 2026-06-24 — 판매 주문 기반 스키마 보강

- 무엇을: Prisma 스키마에 `Product`, `OrderItem`, `Pickup`, `Notification`, `PrivacyAccessLog` 모델과 관련 enum/인덱스를 추가했다.
- 왜: 예약 구매/일반 판매, 무통장 입금, 송장 입력 완료, 현장 수령, 알림, 개인정보 접근 로그를 기존 쿠지 주문 구조 위에 확장하기 위해서다.
- 결과: `apps/backend/prisma/schema.prisma` 검증 통과, Prisma Client 생성 성공, 백엔드 타입체크 통과.
- 마이그레이션: `apps/backend/prisma/migrations/20260624000000_sales_order_foundation/migration.sql` 수동 작성.
- 적용: Docker/Postgres 기동 후 `prisma migrate dev`로 로컬 DB 적용 완료. `migrate status`에서 up to date 확인.
- 다음 작업: seed 데이터와 상품/주문 API 구현.

## 2026-06-24 — 상품 주문용 Order 연결 보강

- 무엇을: `Order.kujiEventId`를 nullable로 변경하는 마이그레이션을 추가/적용했다.
- 왜: 일반 상품 주문은 쿠지 이벤트가 없고 `OrderItem.productId` 기준으로 주문 상품을 연결해야 하기 때문이다.
- 결과: `20260624001000_optional_kuji_order` 적용 완료, `migrate status` 최신 상태 확인.
- 다음 작업: 관리자 입금 확인과 상품별 구매자 현황 조회에 필요한 인덱스/쿼리 점검.

## 2026-06-24 — Order 완료 상태 추가

- 무엇을: `OrderStatus.COMPLETED`를 추가하는 마이그레이션을 적용했다.
- 왜: 현장 수령 완료 주문을 주문 상태에도 명확히 반영하기 위해서다.
- 결과: `20260624002000_order_completed_status` 적용 완료, `migrate status` 최신 상태 확인.
- 다음 작업: 배송 완료 시 주문 완료 처리 자동화 여부를 검토한다.
