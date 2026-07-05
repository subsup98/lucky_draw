#!/bin/sh
set -eu

cd /home/ubuntu/luckydraw

docker run --rm \
  -v /home/ubuntu/luckydraw/infra/certbot/conf:/etc/letsencrypt \
  -v /home/ubuntu/luckydraw/infra/certbot/www:/var/www/certbot \
  certbot/certbot certonly \
    --webroot \
    -w /var/www/certbot \
    --cert-name nizigen.co.kr \
    --email yongon98@naver.com \
    --agree-tos \
    --no-eff-email \
    --non-interactive \
    --keep-until-expiring \
    -d nizigen.co.kr \
    -d www.nizigen.co.kr \
    -d admin.nizigen.co.kr \
    -d api.nizigen.co.kr

docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T nginx nginx -s reload
