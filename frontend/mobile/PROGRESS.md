# frontend/mobile / PROGRESS.md

사용자 모바일 앱(iOS/Android) 진행 로그.

> 참조 문서: 루트의 `requirements.md`(§3 앱 확장), `architecture.md`(§4.1), `frontend/user/PROGRESS.md`, `backend/auth/PROGRESS.md`.

---

## 개요

`apps/user`(웹)에 이어 동일 도메인을 다루는 **네이티브 사용자 앱**을 구축한다.
웹은 SEO/유입 채널, 앱은 결제·푸시·재구매 등 **로열티 채널** 역할.

### MVP 범위 — 풀범위 (확정)
1. 로그인 / 회원가입 / 본인인증
2. 홈(배너 + 진행 중인 쿠지)
3. 쿠지 상세 + 결제(PG)
4. 추첨 결과 연출
5. 마이페이지(주문 / 배송 / 문의)
6. 푸시 알림(배송 상태 변경, 추첨 결과)

---

## 환경 / 제약 (확정)

| 항목 | 값 | 영향 |
|---|---|---|
| **빌드 머신** | macOS 없음 | iOS 빌드는 **클라우드 빌드 필수**(EAS Build / Codemagic / Bitrise 등). 로컬 시뮬레이터 테스트 불가, **실기기 디버깅** 또는 **Android 우선 검증** 필요. |
| **백엔드** | NestJS, refresh token 을 HttpOnly 쿠키로만 발급 | 모바일은 쿠키 기반 인증 부적합 → 백엔드에 모바일 분기 추가 필요 (단계 1). |
| **공유 패키지** | `@lucky/schemas`(Zod), `@lucky/api-types` 존재 | 모바일에서도 그대로 import 가능 (스택 결정과 무관 — JS 런타임이면 호환). |
| **`@lucky/ui`** | Ant Design 기반(웹 전용) | 모바일은 재사용 불가. |
| **결제 / 본인인증 SDK** | **미정** (개발 진행 중 결정) | 일단 PG/본인인증 추상화 가능하도록 인터페이스 분리해 코드 진행. |

---

## 기술 스택 — 미정 (각 단계에서 비교 후 결정)

> 본 섹션은 **선결정하지 않는다**. 각 결정 포인트에 도달했을 때 제약/비교축을 다시 검토하고 본 표를 채운다.
> 결정된 항목은 [확정] 으로, 미정은 [미정] 으로 표기.

| # | 결정 포인트 | 결정 시점 | 후보 (검토 전) | 핵심 비교축 | 상태 |
|---|---|---|---|---|---|
| 1 | **앱 프레임워크** (네이티브 vs 크로스플랫폼 vs PWA·하이브리드) | 단계 0 | RN(Expo Managed) / RN(Bare) / Flutter / Capacitor | macOS 없음 환경, 모노레포 호환, PG·본인인증 SDK, OTA 가능 여부 | [미정] |
| 2 | **라우팅** | 단계 3 (스캐폴딩) | expo-router / React Navigation | 학습 곡선(Next.js App Router 경험), 딥링크 지원, 타입 안전성 | [미정] |
| 3 | **스타일링** | 단계 3 | NativeWind / Tamagui / StyleSheet+테마 / Restyle | 웹 Tailwind 자산 재사용, 성능, 다크모드 | [미정] |
| 4 | **서버 상태** | 단계 4 | TanStack Query / SWR / RTK Query / 직접 fetch | 웹과 동일 라이브러리(`apps/user`)로 일관성, 캐시 무효화 | [미정] |
| 5 | **클라이언트 상태** | 단계 4 | Zustand / Jotai / Redux Toolkit / Context | 웹과 일관성, 보일러플레이트 | [미정] |
| 6 | **폼 / 검증** | 단계 4 | RHF + Zod / Formik + Yup / 직접 | `@lucky/schemas`(Zod) 재사용 → Zod 강력 후보 | [미정] |
| 7 | **보안 저장소** (토큰) | 단계 1~3 | expo-secure-store / react-native-keychain / MMKV(암호화) | 플랫폼 키체인 사용, 만료/마이그레이션 | [미정] |
| 8 | **빌드 / 배포 인프라** | 단계 9 | EAS Build+Update / GitHub Actions+Fastlane / Codemagic | macOS 없음, 비용, OTA 가능, 모노레포 지원 | [미정] |
| 9 | **푸시** | 단계 8 | Expo Push / FCM 직접 / OneSignal | 양 플랫폼 통합, 서버 발송 라이브러리, 토큰 모델 | [미정] |
| 10 | **결제 PG** | 단계 5 | 토스페이먼츠 RN / 포트원(아임포트) / 직접 SDK | 다채널 운영 여부, 웹 자산 재사용(웹은 토스), 인앱결제 이슈 | [미정] |
| 11 | **본인인증** | 단계 7 | PASS(통신사) / NICE / KCB | RN 네이티브 모듈 유무, 가격, 약관 | [미정] |
| 12 | **에러/로깅** | 단계 4~5 | Sentry RN / Datadog RN / 자체 + console | 무료 티어, 소스맵, 알림 | [미정] |

### 운영 원칙
- 결정 항목에 도달하면, 본 문서 해당 행에 **선택 / 사유 / 기각 후보 사유** 를 채우고 변경 로그에 날짜 기록.
- 코드는 결정 전에는 **인터페이스로 추상화**해서 진행. 예: 토큰 저장소는 `interface TokenStore { get/set/clear }` 로 우선 정의, 실 구현은 결정 후 주입.
- **백엔드와의 계약(API)은 스택과 무관**하므로 단계 1, 2 는 모바일 스택 결정 없이도 진행 가능.

---

## 모노레포 위치

- **`apps/mobile`** — 새 워크스페이스. `pnpm-workspace.yaml` 등록 (스택 결정 후).
- 문서: 본 디렉토리 `frontend/mobile/`.
- `@lucky/schemas`, `@lucky/api-types` 그대로 사용. `@lucky/ui` 는 사용 불가.
- **`@lucky/api-client` 신설** — 현재 `apps/user/app/lib/api.ts`, `apps/admin/app/lib/api.ts` 의 중복된 fetch 래퍼(401 자동 refresh + accessToken 자동 첨부)를 패키지로 추출. **토큰 저장소를 주입형 인터페이스**로 설계해 web/mobile 공유.

폴더 트리는 스택(라우팅/스타일링) 결정 후 단계 3 에서 확정.

---

## 인증 분기 (단계 1 — 백엔드 작업)

현재 백엔드는 refresh token 을 **HttpOnly 쿠키로만** 내려준다 ([apps/backend/src/auth/auth.controller.ts](../../apps/backend/src/auth/auth.controller.ts#L64)).
모바일 클라이언트는 쿠키 기반이 부자연스럽고 보안 모델도 다름 → **모바일은 응답 body 로 refresh token 반환**.

### 백엔드 변경 사항
- 요청 헤더 `X-Client: mobile` 로 모바일 식별 (또는 `User-Agent` 패턴).
- `POST /auth/login` / `POST /auth/refresh` / `POST /auth/signup` 응답에 모바일이면 `refreshToken` 도 body 에 포함.
- 쿠키는 그대로 세팅(웹 호환), body 만 추가 — 웹은 무시.
- `POST /auth/logout` 은 모바일이면 쿠키가 없으므로 헤더 또는 body 의 refresh 로 폐기.
- 작업량 추산: 1~2시간.

### 모바일 측 (단계 4 이후)
- 로그인 응답에서 `accessToken` + `refreshToken` 모두 수신 → 보안 저장소에 저장 (#7 결정 후).
- 401 → `/auth/refresh` 호출 시 body 의 `refreshToken` 동봉.
- 로그아웃은 `/auth/logout` + 저장소 clear.

> 자세한 설계는 [backend/auth/PROGRESS.md](../../backend/auth/PROGRESS.md) 에 모바일 분기 섹션 추가 예정.

---

## API 베이스 URL / 네트워킹

- 웹은 Next.js `rewrites` 로 `/api/:path*` 프록시 사용 → **앱에서는 못 씀**.
- 앱은 **절대 URL** 사용: 환경변수로 주입.
- 개발: `http://<dev-machine-ip>:4000/api` (안드로이드 에뮬레이터 / 실기기 모두).
- **CORS**: 백엔드에서 모바일 origin 처리 (native 요청은 origin 비어있을 수 있음 — Helmet/CORS 설정 점검 필요).
- **이미지**: 현재 `/uploads/:path*` rewrite 사용 중 → 앱은 백엔드 절대 URL 직접 사용.

---

## 화면별 체크리스트

### 인증
- [ ] 로그인 (이메일/비번)
- [ ] 회원가입
- [ ] 본인인증 (#11 결정 후)
- [ ] 자동 로그인 (보안 저장소 토큰 복원)
- [ ] 로그아웃

### 홈 / 쿠지
- [ ] 홈 (배너 캐러셀 + 진행 중 쿠지 그리드)
- [ ] 쿠지 상세 (이미지/라인업/구매 폼)
- [ ] 환불 고지 동의 체크 (웹과 동일)
- [ ] 결제 진입 (#10 결정 후)

### 결제 / 추첨
- [ ] 결제 성공 콜백 (deep link 처리)
- [ ] 결제 실패 처리
- [ ] 추첨 연출 화면
- [ ] 추첨 결과 표시

### 마이페이지
- [ ] 주문 목록 / 상세
- [ ] 배송 조회
- [ ] 문의 작성 / 목록 / 상세
- [ ] 회원 탈퇴 (`POST /me/withdraw` 연동)
- [ ] 비밀번호 변경

### 부가
- [ ] 공지 / FAQ
- [ ] 푸시 알림 수신 / 알림함
- [ ] 약관 / 개인정보처리방침 (정적)
- [ ] 강제 업데이트 안내 (스토어 심사 통과용)

---

## 진행 단계

각 단계 도입부에 해당 단계에서 결정해야 할 **스택 결정 포인트(#)** 를 명시.
필요한 경우 보조 문서(예: `frontend/mobile/decisions/01-framework.md`)로 분리 가능.

| 단계 | 작업 | 결정 포인트 | 비고 |
|---|---|---|---|
| 0 | 본 문서 합의 | — | 완료 시 단계 1 진입 |
| 1 | 백엔드 모바일 auth 분기 (`X-Client: mobile` body 토큰) | 없음 (백엔드 기존 스택) | **스택 결정 없이 진행 가능** |
| 2 | `@lucky/api-client` 패키지 추출 + web 양쪽 적용 | 없음 (런타임 무관) | 토큰 저장소 인터페이스 정의(주입형) |
| 3 | 앱 프레임워크 결정 (#1) → `apps/mobile` 스캐폴딩 → 라우팅(#2)·스타일링(#3) 결정 | #1, #2, #3, #7 | macOS 없음 제약 반영 |
| 4 | 상태 관리(#4, #5)·폼(#6) 결정 → 로그인 → 홈 → 쿠지 상세 (실 백엔드 연결, 결제 제외) | #4, #5, #6, #12 | 실기기 디버깅 셋업 |
| 5 | 결제 PG(#10) 결정 → 결제 연동 + 추첨 결과 화면 | #10 | 인앱결제 정책 확인 |
| 6 | 마이페이지(주문/배송/문의) + 자동 로그인 | — | |
| 7 | 본인인증(#11) 결정 → 연동 | #11 | |
| 8 | 푸시(#9) 결정 → 알림 + DeviceToken 등록 + 발송 서버 | #9 | 백엔드에 `DeviceToken` 모델 |
| 9 | 빌드/배포(#8) 결정 → 내부 베타 (TestFlight, Play 내부 테스트) | #8 | macOS 없으므로 클라우드 빌드 |
| 10 | 스토어 등록·심사 대응 | — | 외부 변수 큼 |

---

## 변경 로그

### 2026-05-06
- **확정 사항**: macOS 없음 / MVP 풀범위 진행 / 결제 PG·본인인증 채널은 해당 단계에서 결정.
- **운영 원칙**: 기술 스택은 사전 확정하지 않고 각 결정 포인트에서 제약·비교축을 검토 후 결정 → 본 문서 표에 기록.
- **다음**: 단계 1(백엔드 모바일 auth 분기) 진입 — 스택 결정과 무관하게 진행 가능.
