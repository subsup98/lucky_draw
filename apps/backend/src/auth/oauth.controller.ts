import { BadRequestException, Controller, Get, Logger, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { randomBytes } from 'crypto';
import { OAuthService } from './oauth.service';

/**
 * 소셜 로그인 진입/콜백.
 * - 모바일이 /start 로 진입 → provider authorize URL 로 리다이렉트
 * - provider → /callback?code=.. 로 돌아옴 → 토큰 발급 → deep link 로 모바일 복귀
 *
 * 보안: state 파라미터는 CSRF 방어용. 현재는 cookie 로 잠시 보관.
 */
@Controller('auth/oauth')
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);
  private readonly STATE_COOKIE = 'lucky_oauth_state';

  constructor(private readonly oauth: OAuthService) {}

  @Get('kakao/start')
  startKakao(@Res() res: Response) {
    const state = randomBytes(16).toString('hex');
    res.cookie(this.STATE_COOKIE, state, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 5 * 60 * 1000,
      path: '/api/auth/oauth',
    });
    res.redirect(this.oauth.buildKakaoAuthorizeUrl(state));
  }

  @Get('kakao/callback')
  async callbackKakao(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const deepLinkBase = process.env.APP_DEEP_LINK ?? 'luckydraw://oauth/done';

    if (error || !code) {
      this.logger.warn(`kakao callback error: ${error ?? 'no code'}`);
      return res.redirect(
        `${deepLinkBase}?error=${encodeURIComponent(error ?? 'no_code')}`,
      );
    }

    const cookieState = (res.req.cookies as Record<string, string> | undefined)?.[
      this.STATE_COOKIE
    ];
    if (!cookieState || cookieState !== state) {
      this.logger.warn('kakao state mismatch — possible CSRF');
      return res.redirect(
        `${deepLinkBase}?error=${encodeURIComponent('state_mismatch')}`,
      );
    }

    try {
      const tokens = await this.oauth.handleKakaoCallback(code);
      const params = new URLSearchParams({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        userId: tokens.userId,
      });
      res.clearCookie(this.STATE_COOKIE, { path: '/api/auth/oauth' });
      return res.redirect(`${deepLinkBase}?${params.toString()}`);
    } catch (e) {
      this.logger.error(`kakao callback failed: ${e instanceof Error ? e.message : String(e)}`);
      const msg = e instanceof BadRequestException ? e.message : 'oauth_failed';
      return res.redirect(`${deepLinkBase}?error=${encodeURIComponent(msg)}`);
    }
  }
}
