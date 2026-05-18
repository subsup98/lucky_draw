# 데모 공유 절차 (Track 1 — 임시 URL)

도메인 구매 전 임시 공유용. URL 은 세션마다 바뀐다.

## 1회만 준비

- **cloudflared** 설치: `winget install Cloudflare.cloudflared`
- **테스터**: Expo Go 앱 설치 (App Store / Play Store)

## 매 세션 절차

### A. dev 서버 4개 띄우기

각각 별도 터미널 (또는 `pnpm dev` 한 번에).

```powershell
pnpm dev   # 또는 개별:
# pnpm --filter @lucky/backend dev    # :4000
# pnpm --filter @lucky/user dev       # :3000
# pnpm --filter @lucky/admin dev      # :3001
```

### B. cloudflared 터널 3개 띄우기

새 터미널에서:

```powershell
pwsh scripts/demo-tunnels.ps1
```

3개 URL 이 출력된다:

```
=== Demo URLs ===
  backend  (:4000) -> https://xxx-yyy-zzz.trycloudflare.com
  user     (:3000) -> https://aaa-bbb-ccc.trycloudflare.com
  admin    (:3001) -> https://ddd-eee-fff.trycloudflare.com
```

**테스터에게 공유**: user / admin URL.

### C. 모바일 데모 (Expo Go)

스크립트가 안내한 두 줄을 `apps/mobile/.env` 에 반영:

```
EXPO_PUBLIC_API_BASE_URL=https://xxx-yyy-zzz.trycloudflare.com
EXPO_PUBLIC_OAUTH_BASE_URL=https://xxx-yyy-zzz.trycloudflare.com
```

새 터미널에서 Expo tunnel 시작:

```powershell
pnpm --filter @lucky/mobile start --tunnel
```

QR 코드가 나오면 **테스터 폰의 Expo Go** 로 스캔.

### D. 종료

- 모든 터미널 Ctrl+C
- `apps/mobile/.env` 의 두 값은 다음 데모 때 다시 덮어쓰면 됨 (커밋 대상 아님)

## 알려진 한계

- **URL 매번 바뀜** — 도메인 구매 + Cloudflare named tunnel 로 전환 시 해결 (Track 2)
- **PC 꺼지면 다운** — 데모용이라 OK
- **iOS 시뮬레이터 / Android 에뮬레이터** 는 Expo Go 못 씀 — 실기기 필요
- **카카오 로그인 (4c)** — 도메인 없어서 동작 안 함. 다른 로그인 (이메일) 만 데모 가능

## 트러블슈팅

- `scripts/demo-tunnels.ps1` 에서 `TIMEOUT` 뜨면 `.tunnels/<name>.log` 확인
- Next.js HMR 끊김: cloudflared 가 WebSocket 지원하지만 가끔 느림. 브라우저 새로고침
- 백엔드가 secure 쿠키로 막힘: dev 환경이라 `COOKIE_SECURE=false` 기본값 OK (브라우저는 HTTPS 로 보지만 cookie secure 강제 X)
