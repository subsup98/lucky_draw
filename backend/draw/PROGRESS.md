# backend/draw / PROGRESS.md

추첨 엔진 도메인 진행 로그. 서비스 신뢰성의 핵심.

> 참조 문서: `architecture.md`(§3.1, §6.1), `api.md`(§5), `security.md`(추첨 영역), `requirements.md`.

## 체크리스트
- [ ] POST /draws/execute (서버 측 추첨)
- [ ] GET /me/draw-results
- [ ] 결제 성공 검증 이후에만 추첨 실행
- [ ] 추첨-재고 차감 원자적 처리
- [ ] 난수 생성 전략(재현 가능성, 조작 방지)
- [ ] 추첨 감사 로그

## 의사결정
- (난수 소스, 트랜잭션 방식, 실패 재시도 정책 기록)

## 변경 로그
### YYYY-MM-DD
- (작업 요약)
