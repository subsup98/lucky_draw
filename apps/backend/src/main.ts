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

  app.use(
    helmet({
      // `/uploads/*` 가 타 origin(프런트 포트)에서 이미지로 로드되어야 함 → cross-origin 허용.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
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
