# backend/inventory / PROGRESS.md

재고 도메인 진행 로그. 추첨과의 동시성 정합성이 핵심.

> 참조 문서: `architecture.md`(§6.1), `api.md`(§8), `security.md`, `tasks.md`.

## 체크리스트
- [ ] PATCH /admin/inventory/{inventoryId}
- [ ] 재고 차감 트랜잭션 (추첨과 원자 처리)
- [ ] 재고 소진 처리 및 에러 응답
- [ ] 동시 요청 테스트 시나리오

## 변경 로그
### YYYY-MM-DD
- (작업 요약)
