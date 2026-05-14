#!/usr/bin/env bash
# 보안 리뷰에서 도출된 잔여 항목을 GitHub Issues 로 일괄 등록.
# 전제: gh CLI 설치 + `gh auth login` 완료.
# 사용: bash scripts/file-security-issues.sh
#
# 한 번만 실행. 중복 방지 위해 각 이슈 제목으로 grep 후 skip.

set -euo pipefail

REPO="subsup98/lucky_draw"

mkdir_label() {
  local name=$1 color=$2 desc=$3
  gh label create "$name" --color "$color" --description "$desc" --repo "$REPO" 2>/dev/null || true
}

mkdir_label security    "d73a4a" "보안 관련"
mkdir_label "area:A-crypto"  "0e8a16" "PII 암호화 영역"
mkdir_label "area:B-privacy" "0e8a16" "개인정보처리방침 영역"
mkdir_label "area:C-headers" "0e8a16" "보안 헤더/세션 영역"
mkdir_label "severity:high" "b60205" "high"
mkdir_label "severity:med"  "fbca04" "medium"
mkdir_label "severity:low"  "c5def5" "low"

file_issue() {
  local title=$1 labels=$2 body=$3
  if gh issue list --repo "$REPO" --search "$title in:title" --state all --json title --jq '.[].title' | grep -Fxq "$title"; then
    echo "SKIP (exists): $title"
    return
  fi
  gh issue create --repo "$REPO" --title "$title" --label "$labels" --body "$body"
}

# ─── A. PII 암호화 follow-ups ────────────────────────────────────────────
file_issue "[security][A] 백필 완료 후 ENCRYPTION_STRICT=true 전환 절차 명문화" \
  "security,area:A-crypto,severity:med" \
  "FieldCipherService.decrypt 는 접두어 \`enc:v1:\` 없는 평문을 받으면 strict=false 면 그대로 통과한다. 백필 완료 시점에 이 fallback 이 영구 약점으로 남는다.

- 백필 운영 절차: ENCRYPTION_STRICT=true 환경변수 + 배포 → 평문 컬럼 만나면 즉시 throw.
- staging 에서 검증 후 prod 전환.
- 관련 코드: apps/backend/src/crypto/field-cipher.service.ts"

file_issue "[security][A] 키 회전 (v1→v2) 코드 경로 구현" \
  "security,area:A-crypto,severity:med" \
  "주석에는 v2/v3 추가 시 decrypt 가 모든 버전 처리한다고 했지만 실제로는 v1 한 버전만 처리. 첫 회전 시 모두 다시 작성해야 함.

- key 를 \`{ v1: Buffer, v2: Buffer }\` map 으로 받고 decrypt 가 접두어로 분기하도록 미리 구조화.
- encrypt 는 최신 버전만 사용.
- 회전 절차 문서화 (policy/encryption_ops.md 미공개)."

file_issue "[security][A] 백필 스크립트가 ENCRYPTION_KEY 를 환경변수로 받음" \
  "security,area:A-crypto,severity:med" \
  "현재 \`ENCRYPTION_KEY=... pnpm exec tsx prisma/scripts/backfill-encrypt-pii.ts\` 형태로 키를 shell history / ps 출력 / CI 로그에 노출 가능.

- stdin 또는 secret file (\`--key-file ~/.secrets/enc.key\`) 로 받도록 변경.
- 관련 코드: apps/backend/prisma/scripts/backfill-encrypt-pii.ts"

file_issue "[security][A] 백필 실행 중 동시 write race" \
  "security,area:A-crypto,severity:med" \
  "백필 스크립트는 트랜잭션 없이 행단위 update 라 운영 트래픽 동시 진행 시 새로 INSERT 된 평문 행이 누락될 수 있다. 멱등이라 재실행으로 보완 가능하나 절차에 명시 필요.

- 권장: maintenance mode (쓰기 일시 차단) 또는 readonly 페이로드 기간 후 실행.
- 운영 체크리스트 작성: pre-backfill checks, post-backfill verification."

file_issue "[security][A] AAD 에 rowId/userId binding 추가 검토" \
  "security,area:A-crypto,severity:low" \
  "현재 AAD = \`\${table}:\${column}\` 만. 동일 컬럼 내 row 간 ct swap 은 방어 불가 (Bob 의 phone ct 를 Alice 행에 복사).

- table+column+ownerUserId 로 강화 검토 (Shipment/Order/User 모두 owner 알 수 있음).
- 마이그레이션 비용: 기존 v1 ct 를 새 AAD 로 재암호화 필요."

file_issue "[security][A] Inquiry 본문 미암호화 vs privacy_policy.md 불일치" \
  "security,area:A-crypto,severity:low" \
  "privacy_policy.md 가 '문의 내역' 을 PII 로 명시하고 보유기간 3년. 그러나 Inquiry.body 자체는 평문 저장. 정책 또는 코드 한 쪽 조정 필요.

- 옵션 1: Inquiry.body 도 암호화 대상에 추가 (검색/관리자 텍스트 검색 영향 검토).
- 옵션 2: privacy_policy.md 의 '문의 내역' 항목 표현 조정."

# ─── B. 개인정보처리방침 follow-ups ──────────────────────────────────────
file_issue "[security][B] 회원가입 명시적 동의 체크박스 (한국 PIPA)" \
  "security,area:B-privacy,severity:high" \
  "현재 user 회원가입 화면은 '회원가입 시 ~ 동의하는 것으로 간주' 단순 안내. 개인정보보호법은 명시적 동의(체크박스) 요구.

- 필수 동의: 개인정보처리방침, 이용약관.
- 선택 동의: 마케팅 수신 등 (별도).
- 백엔드에 동의 시각/버전 저장 컬럼 또는 audit log 기록.
- 관련: apps/user/app/login/page.tsx, apps/mobile/app/login.tsx, 백엔드 회원가입 엔드포인트."

file_issue "[security][B] privacy 페이지 fs.readFileSync 가 standalone 빌드와 호환 안 됨" \
  "security,area:B-privacy,severity:med" \
  "apps/{admin,user}/app/privacy/page.tsx 가 \`process.cwd() + ../../policy/privacy_policy.md\` 로 fs 호출. \`force-static\` 으로 빌드 시점 한 번 읽지만 standalone output / 별도 cwd 빌드 환경에서 ENOENT.

- 옵션 1: build 시 policy/* 를 apps/{admin,user}/public 로 copy 스크립트.
- 옵션 2: 빌드 시 generated TS 모듈로 변환 (mobile 의 copy-privacy.mjs 와 동일 패턴)."

file_issue "[security][B] privacy 페이지 마크다운 raw \`<pre>\` 렌더링 UX 개선" \
  "security,area:B-privacy,severity:low" \
  "현재 \`<pre>{md}</pre>\` 로 raw 출력. React escape 덕에 XSS 무해하지만 가독성 낮음.

- react-markdown + rehype-sanitize 도입 검토. 단 marked/DOMPurify 도입 시 XSS 표면 생기므로 sanitize 옵션 신중."

file_issue "[security][B] mobile copy-privacy.mjs 결과를 CI 에서 verify" \
  "security,area:B-privacy,severity:low" \
  "apps/mobile/scripts/copy-privacy.mjs 는 prestart hook 에 연결됨. 그러나 누군가 \`expo start\` 가 아닌 EAS Build / 다른 진입점으로 빌드하면 stale generated 파일 사용 가능.

- CI 단계에서 copy 스크립트 실행 후 \`git diff --exit-code apps/mobile/lib/privacy-text.generated.ts\` 로 source 와 동기화 강제."

# ─── C. 보안 헤더 / 세션 follow-ups ─────────────────────────────────────
file_issue "[security][C] CSRF 토큰 또는 SameSite=strict + Origin 검증 도입" \
  "security,area:C-headers,severity:high" \
  "현재 모든 인증 쿠키 SameSite=lax. prod 에서 admin.example.com + api.example.com 처럼 같은 eTLD+1 이면 cross-site POST 차단 효과 약함. CSRF 방어 마지막 선이 비어있다.

- 옵션 1: 모든 변경 endpoint 에 CSRF 토큰 (double-submit cookie 패턴).
- 옵션 2: 변경 endpoint 에서 Origin/Referer 헤더 검증 미들웨어.
- 옵션 3: SameSite=strict (UX 영향: 외부 링크 통한 로그인 유지 안 됨).
- 관련: apps/backend/src/auth/auth.controller.ts, admin-auth/admin-auth.controller.ts, oauth.controller.ts"

file_issue "[security][C] CSP Report-Only → enforce 전환 + nonce 도입" \
  "security,area:C-headers,severity:med" \
  "현재 admin/user 양쪽 Content-Security-Policy-Report-Only 만 설정. enforce 까지 가야 XSS 마지막 방어 동작.

- Phase 1: report-uri/report-to 설정해 violation 수집.
- Phase 2: 운영에서 위반 없으면 enforce 로 전환.
- Phase 3: next.js inline 부트스트랩 → nonce 도입해 'unsafe-inline' 제거.
- 관련: apps/{admin,user}/next.config.mjs"

file_issue "[security][C] HSTS preload 등록 — 도메인 안정화 후 검토" \
  "security,area:C-headers,severity:low" \
  "현재 maxAge=1y + includeSubDomains 만 설정. preload 는 hstspreload.org 에 등록 시 6~12개월 회수 어려움.

- 모든 서브도메인이 HTTPS 보장된 후, staging/beta 서브도메인 HTTPS 까지 확인 후 preload 등록.
- 절차: maxAge 단계 5분 → 1일 → 1년 → preload."

file_issue "[security][C] /uploads cross-origin 정책 — PII 이미지 업로드 도입 시 분리" \
  "security,area:C-headers,severity:low" \
  "helmet 의 crossOriginResourcePolicy: 'cross-origin' 으로 /uploads/* 가 외부 사이트에서 hotlink 가능. 현재 용도(상품 cover) 는 의도된 동작.

- 향후 주민증/영수증 등 PII 업로드 추가 시: 해당 경로만 same-origin 으로 분리, 또는 서명된 URL + 단기 만료.
- 관련: apps/backend/src/main.ts, apps/backend/src/upload/"

file_issue "[security][C] DEV fallback 키 운영 사고 방지 추가 검증" \
  "security,area:C-headers,severity:low" \
  "FieldCipherService.onModuleInit 가 prod 에서 ENCRYPTION_KEY 미설정 시 throw 함. 추가 방어:

- prod 빌드 시 dev 키 상수 자체를 제거하는 빌드 플래그.
- 부팅 시 \`crypto.timingSafeEqual\` 로 dev 키와 비교해 사용 중이면 즉시 종료."

file_issue "[security][C] enableCors 미사용 명시적 주석" \
  "security,area:C-headers,severity:low" \
  "main.ts 가 NestFactory.create 에서 cors 활성 안 함. admin/user 는 next rewrite 로 same-origin, mobile RN fetch 는 CORS 무관 — 의도된 구성.

- main.ts 에 '의도적 CORS 미사용' 주석 추가.
- 향후 third-party JS SDK 가 직접 API 호출 시점에 enableCors + origin allowlist 도입."

echo "Done."
