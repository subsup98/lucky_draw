# qa / WORKLOG.md

## 2026-06-29 - 무통장/Mock 결제 QA 범위 정리

- 무엇을: 도메인/실결제 없이 검증할 결제 QA 범위를 무통장 입금과 Mock 카드/Mock 카카오페이 성공 흐름으로 정리했다.
- 왜: 실제 PG 승인/실패/웹훅은 운영 도메인과 PG 계정이 필요하지만, 주문 상태 전이와 배송/현장 수령 후처리는 지금 검증 가능하기 때문이다.
- 결과: 우선 검증 대상은 상품 주문 생성, 무통장 입금 대기, 관리자 입금 확인, Mock 결제 성공, 예약 구매 `paidSequence`, 택배 `PREPARING`, 현장 수령 `PICKUP_READY` 알림이다.
- 검증: `corepack pnpm --filter @lucky/backend typecheck`, `corepack pnpm --filter @lucky/user typecheck`, `corepack pnpm --filter @lucky/backend build` 통과. `@lucky/user build`는 장시간 무응답 상태에서 사용자 중단으로 완료 여부 미확인.
- 정리: 장시간 남아 있던 일반 `node.exe` 프로세스 2개를 종료했다. Codex 내부 `node_repl` 프로세스는 유지했다.
- 추가 확인: 5분 제한으로 `corepack pnpm --filter @lucky/user build`를 재시도했으나 사용자 중단 후에도 일반 `node.exe` 자식 프로세스 2개가 남아 CPU를 사용했다. 해당 프로세스는 종료했다.
- 관찰: `corepack pnpm --filter @lucky/user exec next --version`은 `next`를 찾지 못했고, `apps/user/node_modules/.bin`은 비어 있으며 루트 `node_modules/.bin`에만 `next` shim이 존재한다. Windows/pnpm workspace 실행 경로 또는 Next build 자식 프로세스 정리 문제가 의심된다.
- 다음 작업: `@lucky/user build`는 현재 보류한다. 다음 재검증은 `apps/user`의 pnpm shim/설치 상태를 먼저 점검한 뒤, 별도 프로세스 트리 종료 방식으로 최대 5분 제한을 적용한다. 로컬 DB/Redis가 준비되면 사용자 상품 주문 → Mock 결제 → 관리자 주문 상세 확인 E2E 스모크를 실행한다.

OPEN: 실제 카드/카카오페이 실패/취소/webhook QA는 도메인과 PG 테스트 키 준비 후 진행한다.

## 2026-06-24

- 무엇을: 신규 주문 시스템 기준의 QA 역할 문서와 체크리스트를 추가했다.
- 왜: 결제, 배송, 현장 수령, 관리자 권한은 상태 전이 오류가 운영 사고로 이어질 수 있어 별도 검증 기준이 필요하다.
- 결과: 사용자 플로우, 관리자 플로우, 상태/정합성, 보안 테스트 항목을 분리했다.
- 다음 작업: MVP 확정 후 인수 테스트 시나리오를 구체화한다.
