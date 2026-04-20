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
