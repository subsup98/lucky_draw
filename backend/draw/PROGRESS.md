# backend/draw / PROGRESS.md

추첨 엔진 도메인 진행 로그. 서비스 신뢰성의 핵심.

> 참조 문서: `architecture.md`(§3.1, §6.1), `api.md`(§5), `security.md`(추첨 영역), `requirements.md`.

## 체크리스트
- [x] POST /orders/:orderId/draw (서버 측 추첨, PAID → DRAWN)
- [x] GET /orders/:orderId/draws (본인 한정)
- [x] 결제 성공 검증 이후에만 추첨 실행 (Order.status=PAID 가드 + `FOR UPDATE`)
- [x] 추첨-재고 차감 원자적 처리 (`Inventory.version` CAS + 재시도 5회 + DrawResult(orderId,ticketIndex) UNIQUE)
- [x] 난수 생성 전략 (crypto.randomBytes 16B → 상위 48비트 정규화, 티켓별 seed + snapshot 저장)
- [x] 멱등성 (DRAWN 상태면 기존 결과 그대로 반환)
- [x] 추첨 감사 로그 (AuditLog) — 2026-04-21 `DRAW_EXECUTE` 훅 주입
- [x] 라스트원상 전용 트리거(마지막 티켓 구매자 자동 수여) — 2026-04-21

## 의사결정
- **난수 소스**: 티켓마다 `randomBytes(16)` → hex seed 16바이트 저장.
  - 상위 48비트(12 hex)를 `2^48`로 정규화하여 [0,1) 난수 추출.
  - `seed`와 `snapshot`이 DB에 남으므로 운영자도 재현 검증 가능(감사 목적).
- **가중 선택**: `weight = remainingQuantity` — 잔량이 많은 티어일수록 뽑힐 확률 높음. 이치방쿠지의 자연스러운 분포.
- **CAS 방식**: `UPDATE Inventory SET remaining = remaining - 1, version = version + 1 WHERE id = ? AND version = ? AND remaining > 0` — affected rows == 0 이면 재고/버전 재조회 후 재시도(최대 5회).
- **단일 트랜잭션**: Order 락(FOR UPDATE) + 티켓별 CAS + DrawResult insert + Order `PAID → DRAWN` 전이 를 `$transaction(timeout: 15s, ReadCommitted)` 로 감쌈. 부분 추첨 상태로 커밋되지 않음.
- **중복 추첨 차단**: `DrawResult(orderId, ticketIndex)` UNIQUE — 동일 티켓 재추첨 시 P2002.

## 변경 로그

### 2026-04-20
- **Draw 도메인 MVP 완료** — `POST /api/orders/:orderId/draw`, `GET /api/orders/:orderId/draws`.
- **엔진 루프**: 티켓 1..N 반복 → 매 반복마다 잔량 있는 티어 전량 조회 → `weight = remainingQuantity` 가중 랜덤 → CAS 차감 → 실패 시 재시도 → 성공 시 DrawResult 삽입.
- **재현성**: `seed`(hex 32chars) + `snapshot`(추첨 시점 전 티어별 `remainingBefore`·`version`, 선택된 `tierId/rank`, `totalWeight`, `algorithm: 'weighted-remaining-v1'`) 전부 DB에 저장.
- **멱등 입구**: Order.status 가 이미 DRAWN 이면 트랜잭션 진입 없이 `loadResults` 반환. 트랜잭션 내부에서도 FOR UPDATE 이후 상태 재확인.
- **스모크 테스트**: 3장 주문 → 결제 → draw 200 (C 2장, A 1장 추첨) → 재호출 동일 결과 멱등 반환 → 재고 확인(A 3→2, C 30→28, soldTickets 누적 증가) → Order DRAWN 전이. 전부 통과.
- **후속 과제**
  - 결과 조회 UI용 `PrizeItem` 랜덤 선택(현재는 `createdAt asc` 첫 번째). 실제로는 같은 티어 내 복수 아이템 중 1개를 동적 선택.

### 2026-04-21
- **라스트원상 전용 트리거 완료** — `DrawService` 에 `isLastPrize=true` 티어 자동 배정.
- **판정 규칙**: Draw 트랜잭션 내부에서 `isLastPrizeOrder(tx, kujiEventId, orderId)` 가 다음 모두를 검사.
  - (1) `KujiEvent.soldTickets == totalTickets` — 이벤트 완매.
  - (2) 해당 주문이 이 이벤트의 최신 PAID/DRAWN 주문(`createdAt desc`).
  - (3) 루프 인덱스 `i == locked.ticketCount` — 이 주문의 마지막 티켓.
  - 세 조건 모두 만족 시 `awardLastPrize=true`.
- **엔진 분기**: `drawOneWithCAS(tx, eventId, orderId, userId, ticketIndex, awardLastPrize=false)` 6번째 파라미터 추가. 티어 후보 쿼리에 `AND pt."isLastPrize" = ${awardLastPrize}` 필터 — 이로써:
  - 일반 추첨(`false`): 라스트 티어가 후보에서 제외 → 일반 당첨으로 라스트 재고가 소비되지 않음.
  - 라스트 추첨(`true`): `isLastPrize=true` 티어만 후보 → 자동 배정.
- **스냅샷**: `algorithm` 필드를 분기별로 구분(`weighted-remaining-v1` / `last-prize-v1`), `lastPrize: boolean` 플래그도 저장.
- **스모크 테스트**: 기존 15/45 상태에서 신규 3명이 각 10장 주문/결제 → 완매(45/45). o3(최신 주문) 10번 티켓이 `LAST*(isLastPrize=true)` 당첨, 나머지 29티켓은 모두 B/C/A(일반 가중), LAST 재고 1→0 정확히 1회. 이전 주문 o1/o2는 라스트 미획득. 전부 통과.

### 2026-04-22
- **자동 추첨 트리거 도입** — Draw 모듈 자체는 무변경, 단 `DrawService.execute` 가 `PaymentService.confirm/webhook` 의 PAID 전이 직후 자동 호출되도록 호출 측이 변경됨. (상세: [backend/payment/PROGRESS.md](../payment/PROGRESS.md#2026-04-22))
- 멱등 경로(이미 DRAWN) 호출 시 기존 결과 그대로 반환하는 동작은 그대로 — `POST /orders/:id/draw` 는 자동 추첨 실패 시 비상 재시도 엔드포인트로 보존.
- 라스트원 트리거(`isLastPrizeOrder`)는 이제 결제 시점 = 추첨 시점이 즉시 일치하므로 "주문 순서 = 추첨 순서" 가 보장됨 — 더 직관적이고 race condition 가능성 축소.
