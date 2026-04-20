# backend / PROGRESS.md

백엔드 전체 진행 상황 요약. 도메인별 세부 내용은 하위 `PROGRESS.md`에.

> 참조 문서: 루트의 `architecture.md`(§4.2, §5, §6), `api.md`, `requirements.md`, `security.md`, `tasks.md`(§2.4, §2.6).

---

## 기술 스택 (확정: 2026-04-17)

### 확정 스택
- **런타임 / 프레임워크**: Node.js + **NestJS** (TypeScript)
- **데이터베이스**: **PostgreSQL**
- **ORM**: **Prisma**
- **캐시 / 동시성 제어**: **Redis**
- **인증**: JWT(Access) + HttpOnly Cookie(Refresh)
- **결제사 후보**: 토스페이먼츠 또는 포트원(아임포트) — 둘 다 Node SDK 공식 지원

### 선택 이유

#### 1. 왜 NestJS인가 (vs Spring Boot / FastAPI / Go)
- **도메인 모듈 구조가 `architecture.md` §4.2와 1:1 매칭**
  Nest의 `Module` 단위 = auth / kuji / draw / payment … 13개 도메인으로 그대로 떨어짐. 문서와 코드가 일치.
- **팀에 언어 경험이 없는 상황에서 학습 곡선이 가장 완만**
  Java/Spring은 언어 + JVM 생태계(Gradle, JPA N+1, 클래스로더 등)를 동시에 배워야 함. TypeScript는 JS 기반이라 프론트(Next.js)와 언어를 공유해 한 번 학습으로 풀스택 커버 가능.
- **프론트엔드와 타입·DTO·zod 스키마 공유 가능** → API 계약 어긋남 감소, MVP 속도 상승.
- **가드 / 인터셉터 / 파이프 체계**가 관리자 권한 분리, 감사 로그 자동 수집, 멱등성 키 처리 같은 횡단 관심사에 잘 맞음.
- **국내 결제사(토스페이먼츠·포트원) 공식 Node SDK 제공** → 결제 연동 리스크 낮음.

#### 2. 왜 PostgreSQL + Prisma인가
- `architecture.md` §6.1의 **추첨 정합성**(결제 성공 이후 추첨 + 재고 차감 + 결과 저장 원자 처리) 요구를 만족하려면 트랜잭션 + 락이 필수.
- Postgres의 `SELECT ... FOR UPDATE` 비관적 락이 성숙하고, Prisma가 트랜잭션 API를 깔끔하게 래핑.
- JSON 컬럼, 부분 인덱스, CTE 등 운영 중 자주 필요한 기능을 기본 지원.

#### 3. 왜 Redis를 MVP부터 넣는가
- 이치방쿠지 특성상 **"오픈런 스파이크"**가 진짜 리스크. 인기 상품 오픈 시 수천 요청이 몇 초에 집중 → 재고 row에 DB 락 경합이 발생.
- **Redis `DECR` + Lua 스크립트로 재고 카운터를 인메모리에서 차감 후 DB 반영**하면 피크 시 DB 락 경합 회피.
- 선착순 티켓팅과 동일한 정석 패턴.
- 추가로 쿠지 목록/상세 응답 캐시, 속도 제한, 멱등성 키 저장소로도 사용.

### 기각된 대안
| 스택 | 기각 이유 |
|---|---|
| **Spring Boot** | 동시성·결제 생태계는 최강이나, 언어 경험 0 상태에서 학습 부담이 가장 큼. 팀에 Java 경험자가 있었다면 이쪽을 선택. |
| **FastAPI** | 개발 속도는 빠르나 비동기 ORM 성숙도가 낮아 추첨·재고 같은 동시성 핫패스가 위험. |
| **Go** | 런타임 성능은 좋으나 프레임워크 관례가 얕아 도메인 13개의 횡단 관심사(가드·감사·멱등)를 처음부터 직접 설계해야 함. MVP 보일러플레이트 부담 큼. |

### 운영 규모 가정
- 평상시 동시 사용자 **약 1,000명** → NestJS + Postgres 단일 인스턴스로 여유.
- **피크 스파이크(오픈런)** → Redis 카운터로 재고 경합을 DB 밖으로 분리하면 추첨 TPS 병목이 결제사 API 응답으로 이동(모든 스택 공통).
- 트래픽이 예상보다 크게 튈 경우: 스택 교체 전에 **Redis 큐·가상 대기열 도입**이 먼저.

### 스파이크 대응 설계 (MVP부터 반영)
1. **Redis 기반 재고 카운터** — DB 락 경합 회피
2. **결제 멱등성 키(`Idempotency-Key`)** — 재시도 중복 추첨 방지
3. **Postgres Multi-AZ + 읽기 레플리카**(운영 단계) — 조회는 레플리카, 쓰기는 Primary
4. **쿠지 목록/상세 응답 캐시** — Redis TTL 30~60초
5. **가상 대기열** — 초기 생략, 실제 스파이크 발생 후 도입

---

## 도메인
- auth / user / kuji / prize / inventory / order / payment / draw / shipment / notice / inquiry / admin / audit-log

---

## 스캐폴딩 (2026-04-17)

- [x] NestJS 10 + TypeScript 프로젝트 스켈레톤 (`apps/backend/`)
- [x] `nest-cli.json`, `tsconfig.json`, `package.json` 구성
- [x] `src/main.ts` — helmet + cookie-parser + ValidationPipe + `/api` 글로벌 프리픽스 + 포트 4000
- [x] `src/app.module.ts` — ConfigModule 전역
- [x] `src/health.controller.ts` — `GET /api/health` 헬스체크
- [x] `prisma/schema.prisma` — 데이터소스/제너레이터만, 모델은 다음 단계
- [x] 핵심 의존성 포함: `@nestjs/jwt`, `@prisma/client`, `argon2`, `ioredis`, `cookie-parser`, `helmet`, `zod`
- [x] `pnpm install` 실행 완료 (975 패키지)
- [x] Postgres/Redis 컨테이너 기동 + healthy
- [x] 첫 Prisma 마이그레이션(`init_scaffold`) 성공
- [x] 헬스체크 엔드포인트 200 OK 확인
- [x] Prisma 모델 설계 (2026-04-20, database/PROGRESS.md 참조)
- [x] PrismaModule / PrismaService 전역 주입 (2026-04-20)

## 공통 체크리스트
- [ ] 프로젝트 스켈레톤(프레임워크 선정, 레이어 구조)
- [ ] 공통 에러 응답/로깅 포맷
- [ ] 인증/인가 미들웨어
- [ ] 트랜잭션 / 동시성 정책(추첨·재고)
- [ ] 환경변수/시크릿 관리 전략
- [ ] 감사 로그 수집 공통 레이어

## 변경 로그
### 2026-04-20
- **PrismaModule / PrismaService 도입** — `@Global()` 모듈로 전역 주입, `OnModuleInit`에서 `$connect()` + `OnModuleDestroy`에서 `$disconnect()`.
- `HealthController`에 `SELECT 1` 기반 DB ping 추가 → `GET /api/health` 응답에 `db: "ok"|"down"` 반영.
- 스모크 테스트 통과: Prisma 연결 로그 + `/api/health` → `{status:"ok", db:"ok"}`.
- 다음: Auth 도메인(`POST /auth/signup`·`/auth/login`) + Argon2id + JWT 구현.
