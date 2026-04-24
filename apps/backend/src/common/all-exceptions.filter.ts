import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * 전역 예외 필터 — 4xx/5xx 를 통일된 JSON 응답으로 변환하고 요청 컨텍스트를 함께 로깅.
 *
 * - 5xx 또는 HttpException 이 아닌 예외: Logger.error(스택 포함).
 * - 4xx (HttpException): Logger.warn (스택 없이) — 정상 흐름 내 사용자 에러이므로 경고 레벨.
 * - 클라이언트 응답은 `{ statusCode, message, error?, path }` — 기존 Nest 포맷 유지하되 path 만 추가.
 * - 요청 바디/쿠키는 로깅하지 않음(비밀번호·토큰 누출 방지).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { user?: { id: string }; admin?: { id: string } }>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const responseBody = isHttp ? exception.getResponse() : null;
    const normalized = this.normalize(responseBody, status, exception);

    const who = req.admin?.id
      ? `admin=${req.admin.id}`
      : req.user?.id
      ? `user=${req.user.id}`
      : 'anon';
    const line = `${req.method} ${req.url} → ${status} (${who})`;

    if (status >= 500 || !isHttp) {
      const err = exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error(`${line} | ${err.message}`, err.stack);
    } else if (status >= 400) {
      this.logger.warn(`${line} | ${normalized.message}`);
    }

    res.status(status).json({
      statusCode: status,
      message: normalized.message,
      error: normalized.error,
      path: req.url,
    });
  }

  private normalize(
    body: unknown,
    status: number,
    exception: unknown,
  ): { message: unknown; error?: string } {
    if (body && typeof body === 'object') {
      const obj = body as Record<string, unknown>;
      return {
        message: obj.message ?? (exception instanceof Error ? exception.message : 'error'),
        error: typeof obj.error === 'string' ? obj.error : undefined,
      };
    }
    if (typeof body === 'string') return { message: body };
    return {
      message:
        status >= 500
          ? 'Internal server error'
          : exception instanceof Error
          ? exception.message
          : 'error',
    };
  }
}
