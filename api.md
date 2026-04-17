> **[참조 전용 문서]** 이 문서는 프로젝트 기준 문서이므로 **수정하지 말고 참조만** 하세요.
> 실제 작업 내역과 진행 상황은 각 디렉토리의 `PROGRESS.md`에 기록하고, 전체 이력은 루트의 `WORKLOG.md`에 통합해 주세요.

---

# API 초안 (api.md)

## 1. 목적
이 문서는 초기 MVP 기준 API 구조를 정리한 초안이다.

---

## 2. 인증

### POST /auth/signup
- 회원가입

### POST /auth/login
- 로그인

### POST /auth/logout
- 로그아웃

### POST /auth/password/reset
- 비밀번호 재설정 요청

---

## 3. 사용자

### GET /me
- 내 정보 조회

### PATCH /me
- 내 정보 수정

### GET /me/addresses
- 배송지 목록 조회

### POST /me/addresses
- 배송지 등록

### PATCH /me/addresses/{addressId}
- 배송지 수정

### DELETE /me/addresses/{addressId}
- 배송지 삭제

---

## 4. 쿠지

### GET /kujis
- 쿠지 목록 조회

### GET /kujis/{kujiId}
- 쿠지 상세 조회

### GET /kujis/{kujiId}/remaining
- 남은 티켓/경품 현황 조회

---

## 5. 주문/결제/추첨

### POST /orders
- 주문 생성

### POST /payments/confirm
- 결제 확인

### POST /draws/execute
- 추첨 실행
- 내부적으로는 결제 성공 검증 이후 호출되거나 서버 플로우에 포함될 수 있음

### GET /orders/{orderId}
- 주문 상세 조회

### GET /me/draw-results
- 내 추첨 결과 목록 조회

---

## 6. 배송

### GET /me/shipments
- 내 배송 목록 조회

### GET /shipments/{shipmentId}
- 배송 상세 조회

---

## 7. 공지/문의

### GET /notices
- 공지 목록 조회

### GET /notices/{noticeId}
- 공지 상세 조회

### POST /inquiries
- 문의 등록

### GET /me/inquiries
- 내 문의 목록 조회

---

## 8. 관리자

### POST /admin/login
- 관리자 로그인

### GET /admin/kujis
- 관리자용 쿠지 목록

### POST /admin/kujis
- 쿠지 생성

### PATCH /admin/kujis/{kujiId}
- 쿠지 수정

### POST /admin/kujis/{kujiId}/prizes
- 경품 등록

### PATCH /admin/inventory/{inventoryId}
- 재고 수정

### GET /admin/orders
- 주문 목록 조회

### PATCH /admin/orders/{orderId}/shipment
- 배송 상태 변경

### GET /admin/audit-logs
- 감사 로그 조회

---

## 9. 응답 원칙
- 성공/실패 구조를 일관되게 유지
- 사용자에게는 필요한 범위의 오류 메시지만 노출
- 관리자 API는 별도 권한 검증 필수
- 결제/추첨 관련 API는 멱등성 처리 고려
