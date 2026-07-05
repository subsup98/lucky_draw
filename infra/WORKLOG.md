# infra / WORKLOG.md

## 2026-07-05 - v3 preview 자동 배포 트리거 보정

- 무엇을 / `Deploy v3 preview` GitHub Actions 워크플로가 `main` push에서도 실행되도록 트리거를 추가했다.
- 왜 / 로컬 GitHub CLI와 브라우저가 로그인되지 않은 상태에서는 `workflow_dispatch` 수동 실행을 바로 걸 수 없어, 배포 요청 시 push만으로 preview 배포가 시작되도록 하기 위해서다.
- 결과 / `.github/workflows/deploy-v3-preview.yml`에 `push.branches: [main]`을 추가하고, 실행 문서에 수동 실행과 main push 자동 실행 경로를 함께 기록했다.
- 다음 작업 / GitHub Actions 실행 결과를 확인하고, EC2 secrets 누락 또는 SSH/빌드 실패가 있으면 해당 단계별로 보정한다.

## 2026-07-05 - v3 preview 워크플로 env 해석 보정

- 무엇을 / GitHub Actions 전역 `env`에서 secrets/default 표현식을 제거하고 첫 번째 bash step에서 배포 환경값을 검증해 `GITHUB_ENV`로 전달하도록 수정했다.
- 왜 / 워크플로가 job 생성 전 즉시 실패해, GitHub의 워크플로 해석 단계에서 expressions/context 문제가 발생할 가능성을 줄이기 위해서다.
- 결과 / 필수 secrets는 `EC2_HOST`, `EC2_SSH_KEY`만 검증하고 선택값 `EC2_USER`, `EC2_PORT`, `EC2_DEPLOY_DIR`는 bash 기본값으로 처리한다.
- 다음 작업 / main push 후 job 생성 여부와 deploy/smoke check 결과를 확인한다.

## 2026-07-01 - EC2 Docker build prepare script 누락 수정

- 무엇을 / 운영 Dockerfile 3종이 `pnpm install` 전에 `scripts/prepare-hooks.cjs`를 함께 복사하도록 수정했다.
- 왜 / 루트 `package.json`의 `prepare` 스크립트가 Docker 의존성 설치 단계에서 해당 파일을 찾지 못해 EC2 빌드가 중단되었다.
- 결과 / `infra/docker/Dockerfile.backend`, `infra/docker/Dockerfile.user`, `infra/docker/Dockerfile.admin`에 prepare 스크립트 복사를 추가했다.
- 다음 작업 / 수정된 Dockerfile을 EC2에 반영하고 Docker Compose 빌드를 재시도한다.

## 2026-07-01 - EC2 user image Next build 오류 수정

- 무엇을 / 사용자 Docker 이미지에 `policy` 문서를 포함하고 `/v2/login`의 `useSearchParams()` 사용부를 `Suspense`로 감쌌다.
- 왜 / 운영 이미지 빌드 중 `/privacy`가 `policy/privacy_policy.md`를 찾지 못했고, Next.js 14가 `/v2/login` 사전 렌더링에서 Suspense 경계를 요구했다.
- 결과 / `infra/docker/Dockerfile.user`, `infra/docker/Dockerfile.admin`, `apps/user/app/(v2)/v2/login/page.tsx`를 수정했다.
- 다음 작업 / 수정 파일을 EC2에 반영하고 Docker Compose 빌드를 재시도한다.

## 2026-07-01 - EC2 backend Prisma OpenSSL 런타임 수정

- 무엇을 / backend Docker base 이미지를 `node:22-bookworm-slim`으로 전환하고 `openssl`, `ca-certificates`를 설치하도록 수정했다.
- 왜 / Alpine 기반 backend 컨테이너에서 Prisma migration 실행 시 OpenSSL 버전 감지가 실패해 schema engine 응답 파싱 오류가 발생했다.
- 결과 / `infra/docker/Dockerfile.backend`가 Debian slim 기반에서 Prisma migration을 실행하도록 변경되었다.
- 다음 작업 / backend 이미지를 재빌드하고 마이그레이션 및 API 헬스체크를 재확인한다.

## 2026-07-01 - Let's Encrypt 무중단 갱신 경로 추가

- 무엇을 / Nginx webroot 챌린지 경로를 이용해 인증서를 갱신하고 Nginx를 graceful reload 하는 스크립트를 추가했다.
- 왜 / standalone 방식은 갱신 시 80 포트 점유를 위해 Nginx 중지가 필요하지만, webroot 방식은 서비스 중단 없이 HTTP-01 챌린지를 처리할 수 있다.
- 결과 / `infra/certbot/renew-webroot.sh`를 추가했고 dry-run으로 `nizigen.co.kr`, `www`, `admin`, `api` 도메인 검증이 성공했다.
- 다음 작업 / EC2 crontab에 정기 실행을 등록하고 갱신 로그를 주기적으로 확인한다.

## 2026-07-01 - nizigen.co.kr 배포 도메인 반영

- 무엇을 / AWS 무료 티어 Docker Compose 배포 설정의 Nginx HTTP 부트스트랩 라우팅을 `nizigen.co.kr`, `www.nizigen.co.kr`, `admin.nizigen.co.kr`, `api.nizigen.co.kr` 기준으로 정리한다.
- 왜 / 실제 보유 도메인이 확정되어 DNS, OAuth/결제 콜백, 관리자 접근 주소를 예시 도메인에서 운영 후보 도메인으로 바꿔야 한다.
- 결과 / 사용자 도메인은 루트와 `www`, 관리자 도메인은 `admin`, API 콜백용 도메인은 `api` 서브도메인으로 분리하는 방향으로 진행한다.
- 다음 작업 / EC2 Elastic IP 확정 후 Cafe24 DNS A 레코드를 연결하고, HTTPS 적용 후 `.env.prod`의 `COOKIE_SECURE=true`와 콜백 URL을 최종 확인한다.

## 2026-07-01 - AWS 비밀값 관리 계획 저장

- 무엇을 / 운영 비밀값 관리는 무료 시작이 가능한 AWS Systems Manager Parameter Store Standard `SecureString`과 EC2 IAM Role 조합을 우선 적용하기로 계획했다.
- 왜 / 현재 `.env.prod` 평문 비밀값 방식은 초기 배포에는 단순하지만, 서버 파일 유출과 수동 키 관리 위험이 있어 AWS 기본 기능으로 낮은 비용의 개선 경로를 남겨야 한다.
- 결과 / Secrets Manager와 Customer Managed KMS Key는 자동 rotation 또는 별도 키 관리가 필요해질 때 검토하고, MVP 배포 단계에서는 Parameter Store Standard와 AWS 관리형 KMS 키를 우선 사용한다. 대상 비밀값은 `JWT_ACCESS_SECRET`, `ADMIN_JWT_ACCESS_SECRET`, `ENCRYPTION_KEY`, 결제/웹훅 secret, 이메일 앱 비밀번호, 카카오 client secret이다.
- 다음 작업 / 첫 배포는 기존 `.env.prod`로 진행 가능하되, 운영 전 EC2 IAM Role 생성, `/luckydraw/prod/*` 읽기 권한 부여, Parameter Store 값 등록, 서버 시작 전 런타임 env 생성 스크립트 도입을 진행한다.

## 2026-06-29 - AWS 무료 티어 1대 배포 구성 초안 추가

- 무엇을 / AWS 무료 티어 EC2 한 대에서 유저 화면, 관리자 화면, 백엔드, Postgres, Redis, Nginx를 함께 실행하는 Docker Compose 배포 초안을 추가했다.
- 왜 / 내일 실제 AWS 배포 전에 서버에서 바로 복사해 사용할 Dockerfile, 운영 env 예시, Nginx 라우팅, 배포 절차 문서가 필요했다.
- 결과 / `docker-compose.prod.yml`, `infra/docker/*`, `infra/nginx/aws-free-tier.conf`, `.env.prod.example`, `docs/aws-free-tier-deploy.md`를 추가했다. HTTPS는 첫 실행 난이도를 낮추기 위해 HTTP 부트스트랩으로 두고, 운영 전 TLS 전환 작업을 문서화했다.
- 다음 작업 / AWS EC2 생성 후 실제 도메인 값으로 `.env.prod`와 Nginx `server_name`을 반영하고, HTTPS/DB 백업 자동화를 검증한다.

## 2026-06-29 - 도메인/실결제 보류 및 Mock 결제 환경변수 정리

- 무엇을: 실제 도메인과 PG 연동이 불가능한 상태를 전제로 `.env.example`에 Mock 결제 기본값과 Toss 전환용 비밀값 자리를 정리했다.
- 왜: 개발/QA는 Mock 결제로 진행하되, 실결제 전환 시 필요한 환경변수와 보류 항목이 누락되지 않아야 하기 때문이다.
- 결과: `PAYMENT_PROVIDER=mock`, `PAYMENT_INTENT_SECRET`, `PAYMENT_WEBHOOK_SECRET`, `TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`, `TOSS_WEBHOOK_SECRET` 템플릿을 추가했다. 실도메인/PG/카카오/택배사 연동 재개 조건은 `docs/deferred-integrations.md`에 분리했다.
- 다음 작업: 도메인 확정 후 사용자/관리자/API origin, cookie domain/secure, 결제 redirect/webhook URL을 운영 환경변수로 확정한다.

## 2026-06-25 - 도메인 연동 대기 및 내일 작업 예약

- 무엇을: 운영 도메인은 사용자가 2026-06-26에 전달하기로 하여 도메인/DNS/환경변수 연동 작업을 보류했다.
- 왜: 카드/카카오페이, 카카오 로그인/채널, 운영 쿠키/HTTPS 설정은 실제 도메인 기준으로 확정해야 한다.
- 결과: 도메인 1개만 구매해도 `www` 또는 루트, `admin`, `api` 서브도메인으로 사용자/관리자/API를 분리하는 방향으로 진행한다.
- 다음 작업:
  - 전달받은 도메인 기준으로 사용자/관리자/API 주소 확정
  - DNS 레코드 설계: 루트 또는 `www`, `admin`, `api`
  - HTTPS/SSL 적용 방식 확인
  - 운영 환경변수 목록 정리: API origin, cookie secure/domain, redirect URI, webhook URL
  - 결제 PG 성공/실패/웹훅 URL 정리
  - 카카오 로그인 redirect URI 및 카카오 채널/메시지 연동 도메인 정리
  - 배포 후 접속, 로그인, 주문, 결제 콜백 스모크 테스트 계획 작성

## 2026-06-24

- 무엇을: 신규 주문 시스템 기준의 인프라 역할 문서와 체크리스트를 추가했다.
- 왜: 결제, 카카오 채널, 택배사 API, 배치, 개인정보 처리 등 운영 환경 의존성이 늘어났다.
- 결과: 환경변수, 데이터/배치, 운영 모니터링 항목을 분리했다.
- 다음 작업: 신규 외부 연동 후보와 필요한 비밀값 목록을 확정한다.

## 2026-06-25

- 무엇을: 송장 미입력 주문 모니터링 배치 실행 환경을 백엔드 프로세스 내 Nest Schedule cron으로 구성했다.
- 왜: 별도 워커를 두기 전 MVP에서는 백엔드 인스턴스에서 매시간 누락 주문을 감지해 관리자 알림 큐에 쌓는 방식이 가장 단순하다.
- 결과: `detect-missing-invoices` cron이 매시간 실행되며, 15:00 이전 결제 완료 후 1일 초과된 일반 판매 택배 주문 중 운송장 미입력 건을 감지한다.
- 다음 작업: 운영 배포 시 백엔드 인스턴스가 여러 대가 되면 중복 배치 실행 방지(분산락 또는 단일 worker 분리)를 검토한다.
# 2026-07-03 GitHub Actions v3 preview 배포 워크플로우 추가

- 무엇을 / 수동 실행 가능한 `Deploy v3 preview` GitHub Actions 워크플로우를 추가했다.
- 왜 / 운영 EC2 배포 디렉터리가 Git repo가 아니라 tar 기반 복사본이라 `git pull` 배포가 어렵고, v3를 기존 `/v2` 운영 루트와 분리해 테스트 배포해야 하기 때문이다.
- 결과 / `.github/workflows/deploy-v3-preview.yml` 추가. Actions가 소스 압축본을 EC2에 업로드하고 기존 `.env.prod`, 업로드 파일, 인증서 폴더를 보존한 채 `user`, `backend`, `nginx`를 재빌드한다. 사용법은 `docs/github-actions-v3-preview-deploy.md`에 기록했다.
- 다음 작업 / GitHub Secrets에 `EC2_HOST`, `EC2_SSH_KEY`를 등록하고 workflow_dispatch로 첫 배포를 실행한다.

# 2026-07-01 Deployment Complete

- 무엇을 / `nizigen.co.kr` 운영 배포를 EC2, Docker Compose, Nginx, Let's Encrypt HTTPS 구성으로 완료했다.
- 왜 / 다음 작업자가 현재 배포 상태와 남은 운영 과제를 빠르게 이어받을 수 있도록 기준점을 남긴다.
- 결과 / `https://nizigen.co.kr`, `https://admin.nizigen.co.kr`, `https://api.nizigen.co.kr/api/health`가 정상 응답한다. 인증서 무중단 갱신은 webroot + cron으로 등록되어 있고, 실행 로그는 `/home/ubuntu/luckydraw/infra/certbot/renew.log`에 쌓인다.
- 다음 작업 / 관리자 로그인 확인, 초기 상품/판매 데이터 입력, 결제 provider 결정, DB 백업, AWS Parameter Store 전환, 비용 모니터링 확인을 진행한다.
# 2026-07-01 V2 Default Route

- 무엇을 / 사용자 도메인 루트 `https://nizigen.co.kr/` 접속 시 `/v2`로 리다이렉트하도록 Nginx 설정을 수정하고 EC2에 반영했다.
- 왜 / 배포된 v2 사용자 화면을 기본 진입 화면으로 사용하기 위해서다.
- 결과 / `https://nizigen.co.kr/`는 302로 `https://nizigen.co.kr/v2`에 이동하며, `/v2`와 API 헬스체크 모두 정상 응답한다.
- 다음 작업 / 운영 확인 후 영구 전환이 확정되면 302를 301로 바꾸거나 앱 라우트 자체를 v2로 승격한다.
# 2026-07-01 OPEN v1/v2 Route Strategy

- 무엇을 / 기존 사용자 화면(v1)과 새 사용자 화면(v2)을 각각 `/v1`, `/v2`처럼 명시 경로로 접근하게 할지 검토했다.
- 왜 / 현재는 `/`가 `/v2`로 302 이동하고, v2는 `/v2`에서 접근 가능하지만 v1은 루트 기준 라우트로 남아 있어 `/v1` 접속 경로가 아직 없다.
- 결과 / 빠른 방법은 Nginx rewrite로 `/v1`을 기존 루트 라우트에 연결하는 것이고, 안정적인 방법은 Next 앱 라우트 자체를 `/v1/...` 아래로 정리하는 것이다.
- 다음 작업 / 다음 회의에서 `/v1`을 운영에 남길지, v2 완전 전환 후 v1을 숨길지 결정한다.
