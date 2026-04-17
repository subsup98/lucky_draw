# database / PROGRESS.md

DB 설계/마이그레이션 진행 로그.

> 참조 문서: `architecture.md`(§5, §7), `tasks.md`(§2.5), `security.md`(개인정보 영역).

## 테이블 체크리스트
- [ ] User
- [ ] Address
- [ ] KujiEvent
- [ ] PrizeTier
- [ ] PrizeItem
- [ ] Inventory
- [ ] Order
- [ ] Payment
- [ ] DrawResult
- [ ] Shipment
- [ ] Notice
- [ ] Inquiry
- [ ] AdminUser
- [ ] AuditLog

## 마이그레이션
- (버전별 마이그레이션 파일 명세/결과 기록)

## 의사결정
- (DBMS 선택, 인덱싱 전략, 동시성 제어 방식 등)

## 변경 로그
### 2026-04-17
- Postgres 16 컨테이너 기동 (Docker Compose, 포트 5432).
- Prisma 5.22 초기 설정 완료.
- 첫 마이그레이션 `init_scaffold` 적용: `ScaffoldPing` 테이블(임시 검증용, 다음 단계에서 삭제 예정).
- 다음: `architecture.md` §5의 14개 엔티티 스키마 설계.
