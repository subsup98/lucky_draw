import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { AdminAuthService, AdminAuthTokens } from './admin-auth.service';
import { AdminJwtAuthGuard, AdminAuthContext } from './admin-jwt-auth.guard';
import { CurrentAdmin } from './current-admin.decorator';
import {
  AdminBackupCodeDto,
  AdminLoginDto,
  AdminTotpDto,
} from './dto/admin-login.dto';

const REFRESH_COOKIE = 'lucky_admin_rt';

@Controller('admin/auth')
@UseGuards(RateLimitGuard)
export class AdminAuthController {
  constructor(private readonly svc: AdminAuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ key: 'admin:login', limit: 10, windowSec: 300, bodyKeyField: 'username' })
  async login(@Body() dto: AdminLoginDto) {
    return this.svc.login(dto);
  }

  @Post('totp/enroll')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ key: 'admin:totp-enroll', limit: 10, windowSec: 300 })
  async enroll(@Body() dto: AdminTotpDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.svc.totpEnroll(dto);
    this.setRefreshCookie(res, result);
    return {
      accessToken: result.accessToken,
      backupCodes: result.backupCodes,
    };
  }

  @Post('totp/verify')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ key: 'admin:totp-verify', limit: 20, windowSec: 300 })
  async verify(@Body() dto: AdminTotpDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.svc.totpVerify(dto);
    this.setRefreshCookie(res, tokens);
    return { accessToken: tokens.accessToken };
  }

  @Post('backup-code')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ key: 'admin:backup-code', limit: 10, windowSec: 300 })
  async backup(@Body() dto: AdminBackupCodeDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.svc.useBackupCode(dto);
    this.setRefreshCookie(res, tokens);
    return { accessToken: tokens.accessToken };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!raw) {
      res.status(HttpStatus.UNAUTHORIZED);
      return { message: 'no refresh' };
    }
    const tokens = await this.svc.refresh(raw);
    this.setRefreshCookie(res, tokens);
    return { accessToken: tokens.accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    await this.svc.logout(raw);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  @Get('me')
  @UseGuards(AdminJwtAuthGuard)
  async me(@CurrentAdmin() admin: AdminAuthContext) {
    return {
      id: admin.id,
      username: admin.username,
      role: admin.role,
    };
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: 'lax',
      path: '/api/admin',
    };
  }

  private setRefreshCookie(res: Response, tokens: AdminAuthTokens) {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...this.cookieOptions(),
      expires: tokens.refreshExpiresAt,
    });
  }
}
