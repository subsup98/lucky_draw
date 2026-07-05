# AWS Free Tier Deployment Notes

This repo can run on one small Ubuntu EC2 instance for an MVP preview:

- `user`: Next.js public storefront
- `admin`: Next.js operations console
- `backend`: NestJS API
- `postgres`: PostgreSQL
- `redis`: Redis
- `nginx`: reverse proxy

Free tier RAM is tight. Prefer building images locally or on GitHub Actions later. For the first deployment, this Compose setup is intentionally simple and can be moved to a larger instance without changing the app.

## 1. AWS Instance

Recommended first instance:

- Ubuntu 24.04 LTS
- `t3.micro` or current free-tier eligible Ubuntu instance
- Security group inbound: `22`, `80`, and later `443`
- Elastic IP attached before DNS is changed

## 2. Server Bootstrap

Run on the EC2 instance:

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo tee /etc/apt/keyrings/docker.asc >/dev/null
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker ubuntu
```

Log out and back in after `usermod`.

## 3. App Setup

```bash
git clone <your-repo-url> luckydraw
cd luckydraw
cp .env.prod.example .env.prod
nano .env.prod
```

Always pass `--env-file .env.prod` to Compose. Docker Compose otherwise auto-loads a root `.env` file, which can accidentally mix local development values into production.

At minimum, replace:

- `ROOT_DOMAIN`, `USER_DOMAIN`, `ADMIN_DOMAIN`, `API_DOMAIN`
- `POSTGRES_PASSWORD`
- `JWT_ACCESS_SECRET`
- `ADMIN_JWT_ACCESS_SECRET`
- `ENCRYPTION_KEY`
- `ADMIN_SEED_*`
- payment, email, Kakao values when those integrations are ready

Generate `ENCRYPTION_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

For the `nizigen.co.kr` deployment, use:

```env
ROOT_DOMAIN=nizigen.co.kr
USER_DOMAIN=www.nizigen.co.kr
ADMIN_DOMAIN=admin.nizigen.co.kr
API_DOMAIN=api.nizigen.co.kr
KAKAO_REDIRECT_URI=https://api.nizigen.co.kr/api/auth/oauth/kakao/callback
```

## 4. First Run

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f backend
```

Check:

```bash
curl http://localhost/healthz
curl http://localhost/api/health
```

## 5. Seed or Reset Admin

After containers are up:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml exec backend pnpm --filter @lucky/backend exec ts-node scripts/reset-admin.ts
```

Then visit the admin domain and enroll TOTP with the new QR.

## 6. Cafe24 DNS

In Cafe24 DNS, point these records to the EC2 Elastic IP:

- `A` record for `@`
- `A` record for `www`
- `A` record for `admin`
- `A` record for `api`

The current Nginx config routes the public storefront from `nizigen.co.kr` and `www.nizigen.co.kr`, the admin console from `admin.nizigen.co.kr`, and API callbacks from `api.nizigen.co.kr`.

## 7. HTTPS

The included Nginx file is HTTP-only so the first launch is easy. Before real users:

1. Add DNS records and wait for propagation.
2. Install Certbot or switch to an automated TLS reverse proxy.
3. Set `COOKIE_SECURE=true` in `.env.prod`.
4. Update OAuth/payment callback URLs to `https://...`.
5. Recreate containers:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d
```

## 8. Backup

Before production orders, add a database backup job. A minimum manual backup:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml exec postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup.sql
```

Store backups outside the EC2 instance.
