# backend/auth / PROGRESS.md

인증/인가 도메인 진행 로그.

> 참조 문서: `api.md`(§2), `security.md`, `requirements.md`, `tasks.md`(§2.4, §2.6).

---

## 인증 설계 (확정: 2026-04-17)

결제 서비스 특성을 고려해 **일반 e-commerce 상위권 수준**으로 설계. 은행 FAPI 급 보안 기법(DPoP, mTLS)은 2차 도입 여지를 남겨둠.

### 1. 토큰 구조

#### Access Token
- **형식**: JWT **RS256** (키 로테이션 용이, 관리자/사용자 서명키 분리)
- **수명**: **15분**
- **Claims**: `sub`(userId), `role`, `tokenVersion`, `deviceFpHash`, `iat`, `exp`, `jti`
- **저장**: 클라이언트 메모리(Zustand) — `localStorage` 금지
- **전달**: `Authorization: Bearer <token>` 헤더

#### Refresh Token
- **형식**: **Opaque 랜덤 문자열**(32바이트 base64url) — JWT 아님
- **수명**: 사용자 **14일** / 관리자 **1일**
- **저장(클라)**: **HttpOnly; Secure; SameSite=Lax** 쿠키
  - 사용자: `Path=/`
  - 관리자: `Path=/admin` (영역 격리), **SameSite=Strict**
- **저장(서버)**: Redis `refresh:{userId}:{tokenId}` → `{ hashedToken, deviceFpHash, ip, ua, createdAt }`
  - DB에는 해시만. 원본은 절대 저장하지 않음.

### 2. 핵심 정책

#### Refresh Rotation + Reuse Detection
- 매 refresh 요청마다 새 access + 새 refresh 발급, 이전 refresh Redis에서 즉시 제거.
- **같은 refresh가 재사용되면 해당 유저의 모든 세션을 무효화**(탈취로 간주) + 이메일 알림.

#### Device Fingerprint Binding
- 로그인 시 UA + IP(/24 prefix) + 화면 해상도 해시를 생성 → refresh 레코드에 저장.
- Refresh 요청 시 fingerprint 불일치 → 거부 + 이메일 알림 + Step-up 요구.
- IP 변경은 국가/ASN 단위로만 경고(모바일 IP 변동 감안).

#### Token Version
- 사용자 레코드에 `tokenVersion: int`.
- 비밀번호 변경·강제 로그아웃·권한 박탈 시 증가 → 기존 access 전부 무효.

#### CSRF 대응
- Refresh 쿠키 `SameSite=Lax`(관리자 `Strict`)로 1차 차단.
- Refresh·로그아웃 엔드포인트는 **Double-Submit Cookie** 추가 검증:
  - 서버 `XSRF-TOKEN` 비-HttpOnly 쿠키 발급 → 클라가 `X-XSRF-TOKEN` 헤더로 재전송 → 서버 일치 검증.

#### 비밀번호 정책
- **Argon2id** 해시(메모리 64MB, iter 3, parallelism 4 — 성능 테스트 후 조정)
- 최소 10자 + 영문/숫자/특수 중 3종
- **HaveIBeenPwned Pwned Passwords API (k-anonymity 방식)** 대조:
  - 비밀번호 SHA-1 해시의 앞 5자 프리픽스만 HIBP API 전송
  - 응답받은 해시 목록과 나머지 비교
  - 유출 DB에 존재하면 회원가입/변경 거부
  - 원본 비밀번호는 절대 외부로 나가지 않음

#### 계정 잠금
- 로그인 실패 **10회 누적 시 30분 잠금** + 이메일 알림
- 잠금 상태여도 에러 메시지는 "아이디 또는 비밀번호가 일치하지 않습니다"로 통일(열거 방지)

#### 속도 제한
- 로그인: IP당 **5회/분**, 계정당 **10회/10분**
- 회원가입: IP당 **3회/시간**
- 비밀번호 재설정 요청: 계정당 **3회/시간**
- 결제 관련 엔드포인트: 계정당 **10회/분**
- Redis `INCR` + TTL 구현

### 3. 이상 로그인 감지
- 새 기기/새 국가/새 ASN → **이메일 알림 + Step-up 인증 요구**
- 최근 로그인 이력 테이블(`login_events`): userId, IP, UA, country, deviceFpHash, success, at
- 감사 로그와 분리 저장(사용자에게 노출 가능한 이력용)

### 4. Step-up(재인증)
아래 작업 **직전**에 최근 **5분 이내 재인증 기록** 필수:
- 결제 확인 / 추첨 실행
- 배송지 추가·수정·삭제
- 비밀번호 변경
- 관리자 민감 작업(쿠지 생성/수정, 재고 변경, 권한 변경, 감사 로그 조회)

### 5. 2FA (TOTP)
- **관리자·슈퍼 관리자 의무** (MVP부터)
  - 최초 로그인 시 TOTP 등록 강제
  - 등록 완료 전 관리자 기능 접근 차단
  - 백업 코드 10개 발급(일회용)
- **사용자 선택** (MVP에서 UI만 제공, 기본 OFF)
- TOTP 라이브러리: `otplib` 또는 `speakeasy` (Node)

### 6. 비밀번호 재설정
- 요청 시 랜덤 토큰(32바이트) → Redis **30분 TTL** 저장, 이메일로 링크.
- 요청 응답은 항상 200(열거 방지).
- 재설정 성공 시 `tokenVersion++` → 기존 모든 세션 무효화 + 이메일 알림.

---

## 7. API 상세

### POST /auth/signup
- Body: `{ email, password, nickname }` (Zod)
- 동일 이메일 → 409
- **HIBP 유출 DB 대조 → 유출된 비밀번호면 거부**
- 비밀번호 정책 검증
- 성공: 201 `{ userId }`

### POST /auth/login
- Body: `{ email, password, totpCode? }` (관리자는 totpCode 필수)
- 검증 후 access 발급 + refresh 쿠키 Set-Cookie
- Device fingerprint 생성·저장
- 새 기기 감지 시 이메일 알림
- 실패 메시지 통일

### POST /auth/refresh
- 쿠키 refresh 읽어 Redis 조회 + fingerprint 일치 검증 + CSRF 검증
- Rotation + Reuse Detection
- 성공: 새 access + 새 refresh

### POST /auth/logout
- Redis refresh 제거, 쿠키 만료

### POST /auth/password/reset
- `{ email }` → 항상 200

### PATCH /auth/password/reset/confirm
- `{ token, newPassword }` → HIBP 대조 → `tokenVersion++`

### POST /admin/login
- 별도 경로 / 더 타이트한 속도 제한(IP당 **3회/분**)
- TOTP **필수**
- IP 화이트리스트 옵션(슈퍼 관리자)

### POST /auth/step-up
- 최근 인증 시각 갱신 (비밀번호 재확인 또는 TOTP)
- 결제·민감 작업 전 호출

---

## 8. 권한 (RBAC)
- 역할: `user` / `admin` / `super_admin`
- NestJS Guard + `@Roles()` 데코레이터
- 민감 작업은 `@RequireReauth(5m)` 가드 추가
- 감사 로그는 인터셉터에서 자동 기록

---

## 9. 체크리스트
- [~] POST /auth/signup (Argon2id 완료, HIBP 대조 TODO)
- [~] POST /auth/login (Argon2id 검증·열거 방지·lastLoginAt 완료; Device FP·이메일 알림 TODO)
- [~] POST /auth/refresh (Rotation + Reuse Detection 완료; FP·CSRF TODO)
- [x] POST /auth/logout
- [ ] POST /auth/password/reset
- [ ] PATCH /auth/password/reset/confirm + HIBP
- [ ] POST /auth/step-up
- [ ] POST /admin/login + TOTP 필수
- [ ] TOTP 등록/검증/백업 코드
- [x] Argon2id 해시
- [x] Redis refresh 저장소 (SHA-256 해시만 저장, TTL 14일)
- [ ] Redis 속도 제한
- [ ] CSRF Double-Submit
- [ ] tokenVersion 증가 훅
- [ ] 계정 잠금(10회/30분)
- [ ] 이상 로그인 감지 + 이메일 알림
- [ ] 감사 로그 인터셉터
- [ ] Step-up 가드(`@RequireReauth`)

---

## 변경 로그

### 2026-04-17
- 인증 설계 확정. 업계 벤치마크: 일반 e-commerce 상위권(쿠팡·배민·카카오 급), FAPI 아래.
- JWT RS256 Access(15m, 메모리) + Opaque Refresh(사용자 14d / 관리자 1d, HttpOnly 쿠키 + Redis).
- Rotation + Reuse Detection + Device Fingerprint Binding.
- Argon2id + HaveIBeenPwned 유출 DB 대조 채택.
- 관리자·슈퍼 관리자 **TOTP 2FA 의무** (MVP부터). 사용자는 선택.
- Step-up 재인증(5분) 도입: 결제·배송지 변경·비밀번호 변경·관리자 민감 작업.
- 이상 로그인 감지 + 이메일 알림.
- CSRF Double-Submit(refresh 전용). 관리자 쿠키 SameSite=Strict + Path=/admin.
- DPoP·Passkey·소셜 로그인은 2차로 보류.

### 2026-04-20
- **MVP 인증 플로우 구현 완료**: `POST /auth/signup`·`/login`·`/refresh`·`/logout`.
- **구현**: Argon2id(m=64MB, t=3, p=4) / JWT HS256 Access(15m, `sub`+`tv`) / Opaque Refresh(`userId.tokenId.secret`, secret만 SHA-256 해시로 Redis 저장, 14d TTL) / HttpOnly·SameSite=Lax 쿠키.
- **Rotation + Reuse Detection 동작 확인**: rotation된 구 refresh 재사용 시 401 + `tokenVersion++`로 전체 세션 무효화(직후 새 refresh도 거부).
- **열거 방지**: 미존재 계정에도 더미 Argon2 verify 수행, 실패 메시지 `invalid credentials`로 통일.
- **JwtAuthGuard**: 토큰 검증 + `tokenVersion` 대조로 강제 로그아웃 대응.
- Schema 변경: `User.tokenVersion: Int @default(0)` 추가(마이그레이션 `add_user_token_version`).
- **TODO로 남긴 항목**: RS256 키 로테이션, HIBP 대조, TOTP 2FA, CSRF Double-Submit, Device FP, 계정 잠금, Step-up, 속도 제한, 이상 로그인 감지·이메일 알림, 관리자 전용 `/admin/login`(SameSite=Strict·Path=/admin·TOTP 필수).
