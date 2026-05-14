import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { AuthService, AuthTokens } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { SignupDto } from './dto/signup.dto';
import {
  RequestPasswordResetDto,
  ResetPasswordDto,
  VerifySignupCodeDto,
} from './dto/email-verification.dto';

const REFRESH_COOKIE = 'lucky_rt';
const CLIENT_HEADER = 'x-client';

/**
 * 클라이언트 종류 판별.
 * - 웹: 헤더 없음 또는 `web` → refresh 는 HttpOnly 쿠키.
 * - 모바일: `X-Client: mobile` (또는 `mobile-ios` / `mobile-android`) → refresh 는 응답 body.
 *
 * 쿠키와 body 를 둘 다 세팅하지 않는 이유: 모바일은 쿠키를 쓰지 않으므로 무의미한 Set-Cookie 가 됨.
 */
function isMobileClient(req: Request): boolean {
  const v = req.headers[CLIENT_HEADER];
  const value = Array.isArray(v) ? v[0] : v;
  return typeof value === 'string' && value.toLowerCase().startsWith('mobile');
}

@Controller('auth')
@UseGuards(RateLimitGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ key: 'auth:signup', limit: 5, windowSec: 3600 })
  async signup(@Body() dto: SignupDto) {
    const { userId } = await this.auth.signup(dto);
    return { userId };
  }

  /**
   * 가입 1단계: 이메일 인증 코드 요청.
   * 비번 + 가입 정보를 Redis 에 5분 보관, 이메일로 6자리 코드 발송.
   */
  @Post('email/request-code')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ key: 'auth:email-code', limit: 5, windowSec: 600, bodyKeyField: 'email' })
  async requestSignupCode(@Body() dto: SignupDto) {
    await this.auth.requestSignupCode(dto);
    return { ok: true };
  }

  /**
   * 가입 2단계: 코드 검증 → 사용자 생성 + 자동 로그인 토큰 발급.
   */
  @Post('email/verify')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ key: 'auth:email-verify', limit: 10, windowSec: 600, bodyKeyField: 'email' })
  async verifySignupCode(
    @Body() dto: VerifySignupCodeDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.verifySignupCode(dto);
    if (isMobileClient(req)) {
      return this.mobileTokenBody(result, { userId: result.userId });
    }
    this.setRefreshCookie(res, result);
    return { userId: result.userId, accessToken: result.accessToken };
  }

  /**
   * 비밀번호 재설정 1단계: 이메일로 코드 발송.
   * 사용자 존재 여부는 응답에 노출하지 않음.
   */
  @Post('password/request-code')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ key: 'auth:pwreset-code', limit: 5, windowSec: 600, bodyKeyField: 'email' })
  async requestPasswordResetCode(@Body() dto: RequestPasswordResetDto) {
    await this.auth.requestPasswordResetCode(dto);
    return { ok: true };
  }

  /**
   * 비밀번호 재설정 2단계: 코드 + 새 비밀번호 검증 → 비번 변경 + 모든 세션 폐기.
   */
  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ key: 'auth:pwreset', limit: 10, windowSec: 600, bodyKeyField: 'email' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto);
    return { ok: true };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ key: 'auth:login', limit: 10, windowSec: 300, bodyKeyField: 'email' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto);
    if (isMobileClient(req)) {
      return this.mobileTokenBody(result, { userId: result.userId });
    }
    this.setRefreshCookie(res, result);
    return { userId: result.userId, accessToken: result.accessToken };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() body: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const mobile = isMobileClient(req);
    const raw = mobile
      ? body.refreshToken
      : (req.cookies?.[REFRESH_COOKIE] as string | undefined);
    if (!raw) {
      res.status(HttpStatus.UNAUTHORIZED);
      return { message: 'no refresh' };
    }
    const tokens = await this.auth.refresh(raw);
    if (mobile) {
      return this.mobileTokenBody(tokens);
    }
    this.setRefreshCookie(res, tokens);
    return { accessToken: tokens.accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Body() body: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const mobile = isMobileClient(req);
    const raw = mobile
      ? body.refreshToken
      : (req.cookies?.[REFRESH_COOKIE] as string | undefined);
    await this.auth.logout(raw);
    if (!mobile) {
      res.clearCookie(REFRESH_COOKIE, { path: '/' });
    }
  }

  private setRefreshCookie(res: Response, tokens: AuthTokens) {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      // prod 에서는 COOKIE_SECURE 값과 무관하게 항상 secure 강제 — 평문 쿠키 사고 방지.
      secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true',
      sameSite: 'lax',
      path: '/',
      expires: tokens.refreshExpiresAt,
    });
  }

  private mobileTokenBody<T extends Record<string, unknown>>(
    tokens: AuthTokens,
    extra?: T,
  ) {
    return {
      ...(extra ?? {}),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      refreshExpiresAt: tokens.refreshExpiresAt.toISOString(),
    };
  }
}
