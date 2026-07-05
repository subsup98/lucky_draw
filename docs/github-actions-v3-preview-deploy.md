# GitHub Actions v3 Preview Deploy

`Deploy v3 preview` workflow는 기존 운영 루트(`/` -> `/v2`)는 유지하고, 테스트용 `/v3` 화면만 최신 코드로 배포하기 위한 수동 배포 워크플로우입니다.

## Required GitHub Secrets

- `EC2_HOST`: 운영 EC2 public IP 또는 DNS. 예: `3.105.194.101`
- `EC2_SSH_KEY`: `nizigen.pem` 파일 내용 전체

## Optional GitHub Secrets

- `EC2_USER`: 기본값 `ubuntu`
- `EC2_PORT`: 기본값 `22`
- `EC2_DEPLOY_DIR`: 기본값 `/home/ubuntu/luckydraw`

## How It Works

1. GitHub Actions가 현재 repo 소스를 압축합니다.
2. `.env`, `.env.prod`, 업로드 파일, 인증서 폴더는 압축에서 제외합니다.
3. 압축 파일을 EC2 `/tmp/luckydraw-release.tgz`로 업로드합니다.
4. EC2의 기존 `/home/ubuntu/luckydraw/.env.prod`를 보존한 채 소스를 덮어씁니다.
5. `user`, `backend`, `nginx` 컨테이너를 다시 빌드/시작합니다.
6. 아래 URL을 smoke check 합니다.

```bash
https://nizigen.co.kr/v3
https://nizigen.co.kr/v3/products
https://nizigen.co.kr/api/products
https://api.nizigen.co.kr/api/health
```

## Run

GitHub repository 페이지에서 수동으로 실행하거나, `main` 브랜치에 push하면 자동으로 실행됩니다.

수동 실행:

1. `Actions`
2. `Deploy v3 preview`
3. `Run workflow`

## Notes

- 운영 루트는 계속 `/v2`로 유지됩니다.
- 운영 환경에서는 v3 데모 fallback이 비활성화되어 실제 API 오류를 숨기지 않습니다.
