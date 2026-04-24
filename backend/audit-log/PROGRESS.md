# backend/audit-log / PROGRESS.md

감사 로그 도메인 진행 로그.

> 참조 문서: `api.md`(§8), `security.md`, `architecture.md`(§6.2).

## 체크리스트
- [x] GET /admin/audit-logs (관리자 도메인 합류 이후) — 2026-04-22, `actorType/actorUserId/adminUserId/action/targetType/targetId/from/to` 필터 + cursor 페이지네이션
- [x] GET /me/audit-logs (본인 로그 조회, `action` 필터, `limit` 1..100)
- [x] 주문 생성 / 취소 기록 (`ORDER_CREATE`, `ORDER_CANCEL`)
- [x] 결제 확정 기록 (`PAYMENT_CONFIRM`, `PAYMENT_WEBHOOK_CONFIRM`)
- [x] 추첨 실행 기록 (`DRAW_EXECUTE` — 티켓별 tierRank·isLastPrize 메타)
- [ ] 관리자 민감 작업 기록 (AdminUser 도메인 이후)
- [ ] 보존 기간 및 접근 통제 정책 (법적 보관주기 확정 후)
- [ ] 로그 위·변조 방지 전략 (append-only 강제, 주기적 해시 체인)

## 설계 원칙

1. **Fire-and-forget**: `AuditLogService.record()` 는 예외를 삼키고 Logger로만 warn. 감사 기록 실패가 주 트랜잭션(주문·결제·추첨)을 무너뜨리지 않도록 분리.
2. **확정 사실만 기록**: 주 트랜잭션이 성공적으로 커밋된 직후에 호출. 롤백되면 감사도 없음.
3. **IP/UA는 컨트롤러에서 수집**: `extractAuditCtx(req)` 헬퍼로 `X-Forwarded-For` 첫 주소 또는 `req.ip`, User-Agent 헤더를 길이 제한(IP 64 / UA 512)하여 수집.
4. **actorType 구분**: 사용자는 `USER` + `actorUserId`, 시스템 자동화(webhook)는 `SYSTEM`, 관리자는 추후 `ADMIN` + `adminUserId`.
5. **@Global 모듈**: 어느 도메인에서도 주입 가능하도록 전역 노출.

## 변경 로그

### 2026-04-21
- **AuditLog MVP 완료**.
- 모듈: `@Global()` 로 `AuditLogModule` 등록, `app.module.ts` 에 편입.
- 서비스: `record({ actorType, actorUserId?, adminUserId?, action, targetType?, targetId?, metadata?, ctx? })` — 실패 시 warn 로그만.
- 헬퍼: `audit-context.ts` 의 `extractAuditCtx(req)` — IP/UA 추출·트림.
- 주입 지점:
  - `OrderService.create` → `ORDER_CREATE` (201 신규 생성에 한해; 멱등 재응답·기존 주문 반환은 기록 안 함). 메타: kujiEventId/ticketCount/totalAmount/idempotencyKey.
  - `OrderService.cancel` → `ORDER_CANCEL`.
  - `PaymentService.confirm` → `PAYMENT_CONFIRM` (source=client_confirm).
  - `PaymentService.webhook` → `PAYMENT_WEBHOOK_CONFIRM` (actorType=SYSTEM, source=webhook; client confirm 부재 시 webhook 단독 확정 경로에서만).
  - `DrawService.execute` → `DRAW_EXECUTE`. 메타: 티켓별 tierRank/isLastPrize 요약. 멱등 경로(이미 DRAWN)는 기록 안 함.
- 조회 API: `GET /api/me/audit-logs?action=&limit=` (최근 50건 기본, 최대 100).
- 스모크 테스트 통과:
  1. signup → order(2장) → intent → confirm → draw → `GET /me/audit-logs` → 3건(ORDER_CREATE, PAYMENT_CONFIRM, DRAW_EXECUTE) 최신순 응답, 모든 항목 IP `::1`·UA `audit-smoke/1.0` 기록.
  2. 별도 계정으로 order → cancel → `GET /me/audit-logs?action=ORDER_CANCEL` → 1건, UA `cancel-smoke/1.0`.

### 2026-04-22
- **관리자 `GET /api/admin/audit-logs` 완료** — `backend/admin` 도메인 합류 시점에 함께 배포(AdminAuthModule 컨트롤러로 등록, `AdminJwtAuthGuard` 적용).
- 필터: `actorType(ADMIN|SYSTEM|USER) / actorUserId / adminUserId / action / targetType / targetId / from / to`.
- 페이지네이션: `limit` 1..200(기본 50) + `cursor=id`, `take limit+1` 로 `hasNext` 판정 → `{items, nextCursor, limit}`.
- 상세는 [backend/admin/PROGRESS.md](../admin/PROGRESS.md#2026-04-22) 참조.

### 남은 작업 (다음 사이클)
- 관리자 민감 작업 기록 (ADMIN_* actions)
- 보존 기간 정책 확정 + TTL 파티셔닝
- 위·변조 방지(해시 체인 or append-only 트리거)
