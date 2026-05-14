import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { UPLOAD_DIR, PUBLIC_UPLOAD_PATH } from './upload/upload.controller';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  // HSTS: prod 환경에서만 활성. dev 에서 켜면 브라우저가 localhost 도 https 로 강제해 개발 흐름이 깨짐.
  const isProd = process.env.NODE_ENV === 'production';
  app.use(
    helmet({
      // `/uploads/*` 가 타 origin(프런트 포트)에서 이미지로 로드되어야 함 → cross-origin 허용.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // HSTS 1년 + 서브도메인 + preload. prod 에서만 헤더 출력.
      // preload 는 도메인 안정화 후 별도 단계 (한 번 등록 시 회수 어려움).
      hsts: isProd
        ? { maxAge: 31536000, includeSubDomains: true, preload: false }
        : false,
      // 백엔드는 API 응답이 대부분 JSON 이므로 CSP 는 next.js 측에서 관리.
      contentSecurityPolicy: false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      frameguard: { action: 'deny' },
    }),
  );
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.setGlobalPrefix('api');
  // 업로드 이미지 정적 서빙 — `/uploads/xxx.png` 로 접근.
  app.useStaticAssets(UPLOAD_DIR, { prefix: PUBLIC_UPLOAD_PATH });

  const port = Number(process.env.BACKEND_PORT ?? 4000);
  await app.listen(port);
  console.log(`[backend] listening on http://localhost:${port}/api`);
}

bootstrap();
