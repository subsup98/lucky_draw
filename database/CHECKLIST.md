# database 체크리스트

## 현황 분석

- [x] 기존 `KujiEvent`, `Order`, `Payment`, `Shipment` 모델과 신규 `Product`, `OrderItem`, `Pickup` 요구사항 비교
- [x] 기존 주문 상태 enum이 예약/일반 판매 흐름을 표현할 수 있는지 검토
- [x] 기존 결제 모델이 무통장 입금, 계좌이체, 카카오페이, 환불 이력을 표현할 수 있는지 검토
- [x] 기존 배송 모델이 송장 입력 완료와 배송 중을 분리할 수 있는지 검토

## 신규/보강 모델

- [x] `Product` 또는 기존 상품 모델 확장 설계
- [x] `OrderItem` 설계
- [x] 예약 구매 순번 컬럼 설계: `reservationSequence`, `paidSequence`
- [x] `Pickup` 모델 설계
- [x] `Notification` 모델 설계
- [x] `PrivacyAccessLog` 모델 설계

## 개인정보/감사

- [ ] 이름/전화번호/주소 암호화 저장 범위 결정
- [x] 주문 당시 배송지 스냅샷 보존 정책 검토
- [x] 관리자 개인정보 조회 로그 설계
- [x] 엑셀/CSV 다운로드 로그 설계

## 마이그레이션

- [x] 스키마 변경안 작성
- [x] Prisma migration 생성
- [x] seed 데이터 보강
- [ ] 롤백/데이터 보존 전략 확인
