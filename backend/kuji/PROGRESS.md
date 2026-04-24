# backend/kuji / PROGRESS.md

쿠지 이벤트 도메인 진행 로그.

> 참조 문서: `api.md`(§4, §8), `architecture.md`(§5), `requirements.md`.

## 체크리스트
- [x] GET /kujis
- [x] GET /kujis/{kujiId}
- [x] GET /kujis/{kujiId}/remaining
- [ ] 관리자 쿠지 CRUD (§8)
- [ ] 판매 기간/제한 정책 적용 (서버 측 `isOnSale` 계산만 완료, 주문 생성 시점 강제 차단은 order 도메인에서)

## 변경 로그
### 2026-04-20
- **조회 API 3종 구현 완료** — `GET /kujis`, `GET /kujis/:id`, `GET /kujis/:id/remaining`.
- `list`: DRAFT·CLOSED 제외, `remainingTickets`·`isOnSale` 계산 필드 포함.
- `detail`: PrizeTier·PrizeItem·Inventory까지 한 번에 join.
- `remaining`: tier별 `total`/`remaining` 반환(재고 현황 UI 용).
- Prisma 시드(`prisma/seed.ts`) 작성 — 데모 쿠지(총 45티켓, 5개 티어) + SUPER_ADMIN 계정(`root` / `AdminPass1!`). `package.json#prisma.seed` 등록.
- `npx prisma db seed` 성공 후 실 API 호출로 3개 엔드포인트 전부 검증.

### 2026-04-23
- **관리자 쿠지/티어/재고 CRUD API 완료** — `src/kuji/admin-kuji.controller.ts` (`@UseGuards(AdminJwtAuthGuard)`).
- **이벤트**: `POST /api/admin/kujis` (slug kebab-case regex 검증, 기본 DRAFT, P2002 → 409) / `PATCH /api/admin/kujis/:id` (`soldTickets>0` 이면 price·saleStartAt 변경 차단) / `PATCH /api/admin/kujis/:id/status` (CLOSED→재개방 거부, ON_SALE 전환 시 티어 최소 1개 강제).
- **티어**: `POST /api/admin/kujis/:id/tiers` — DRAFT/SCHEDULED 에서만, `$transaction` 으로 `PrizeTier + PrizeItem[] + Inventory(total=remaining=totalQuantity)` 원자 생성, `isLastPrize` 중복 방지, `(kujiEventId, rank)` UNIQUE.
- **티어 수정/삭제**: `PATCH /admin/kujis/tiers/:tierId` (name, displayOrder, isLastPrize — last-prize 중복 방지) / `DELETE /admin/kujis/tiers/:tierId` (drawResults 있으면 409, status 제약).
- **재고**: `PATCH /admin/kujis/tiers/:tierId/inventory` — `{delta, reason}`. 트랜잭션 내 `Inventory.total+delta`, `remaining+delta`, `version++`, `PrizeTier.totalQuantity` 동기화. remaining 음수/total 음수 거부.
- **AuditLog**: 모든 mutation 에 `KUJI_{CREATE,UPDATE,STATUS_UPDATE}` / `TIER_{CREATE,UPDATE,DELETE}` / `INVENTORY_ADJUST` 기록 — metadata 에 before/after 스냅샷.
- 6 패키지 typecheck 통과. 런타임 스모크는 Docker 재기동 후 예정.
