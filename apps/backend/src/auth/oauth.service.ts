import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, AuthTokens } from './auth.service';

/**
 * 소셜 로그인 (OAuth 2.0 Authorization Code Flow).
 *
 * 흐름:
 *   1. /auth/oauth/{provider}/start — 모바일이 브라우저로 진입 → provider authorize 페이지로 302
 *   2. provider 가 /auth/oauth/{provider}/callback?code=... 로 리다이렉트
 *   3. 백엔드: code → access_token 교환 → 사용자 정보 조회 → User upsert → 우리 JWT 발급
 *   4. 모바일 deep link (luckydraw://oauth/done?accessToken=..&refreshToken=..) 으로 302
 *   5. 모바일 WebBrowser 가 deep link 감지 → 닫히고 앱 복귀, 토큰 추출
 */
@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  // ─── 카카오 ─────────────────────────────────────────────────────────

  buildKakaoAuthorizeUrl(state: string): string {
    const clientId = process.env.KAKAO_REST_API_KEY;
    const redirectUri = process.env.KAKAO_REDIRECT_URI;
    if (!clientId || !redirectUri) {
      throw new Error('KAKAO_REST_API_KEY / KAKAO_REDIRECT_URI 미설정');
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      state,
      scope: 'account_email',
    });
    return `https://kauth.kakao.com/oauth/authorize?${params.toString()}`;
  }

  async handleKakaoCallback(code: string): Promise<AuthTokens & { userId: string }> {
    const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.KAKAO_REST_API_KEY!,
        redirect_uri: process.env.KAKAO_REDIRECT_URI!,
        code,
        ...(process.env.KAKAO_CLIENT_SECRET
          ? { client_secret: process.env.KAKAO_CLIENT_SECRET }
          : {}),
      }),
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      this.logger.error(`kakao token exchange failed: ${tokenRes.status} ${text}`);
      throw new BadRequestException('kakao token exchange failed');
    }
    const tokenJson = (await tokenRes.json()) as { access_token: string };

    const userRes = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!userRes.ok) {
      const text = await userRes.text();
      this.logger.error(`kakao userinfo failed: ${userRes.status} ${text}`);
      throw new BadRequestException('kakao userinfo failed');
    }
    const profile = (await userRes.json()) as {
      id: number;
      kakao_account?: { email?: string };
      properties?: { nickname?: string };
    };

    const kakaoId = String(profile.id);
    const email = profile.kakao_account?.email?.toLowerCase();
    const nickname = profile.properties?.nickname;

    const userId = await this.upsertOAuthUser({
      provider: 'kakao',
      providerId: kakaoId,
      email,
      name: nickname,
    });

    return this.auth.loginByUserId(userId);
  }

  // ─── upsert 공통 로직 ─────────────────────────────────────────────────

  /**
   * provider 식별자로 기존 User 찾고, 없으면:
   *   - 같은 이메일 가진 User 가 있으면 그 계정에 provider id 연결 (기존 가입 통합)
   *   - 둘 다 없으면 신규 User 생성 (passwordHash 는 무작위 → 비번 로그인 차단)
   */
  private async upsertOAuthUser(params: {
    provider: 'kakao' | 'naver' | 'google';
    providerId: string;
    email?: string;
    name?: string;
  }): Promise<string> {
    const idField = `${params.provider}Id` as 'kakaoId' | 'naverId' | 'googleId';

    const byProvider = await this.prisma.user.findFirst({
      where: { [idField]: params.providerId },
      select: { id: true },
    });
    if (byProvider) return byProvider.id;

    if (params.email) {
      const byEmail = await this.prisma.user.findUnique({
        where: { email: params.email },
        select: { id: true },
      });
      if (byEmail) {
        await this.prisma.user.update({
          where: { id: byEmail.id },
          data: { [idField]: params.providerId },
        });
        return byEmail.id;
      }
    }

    // 신규 — 비밀번호 로그인 차단용 무작위 해시.
    const randomPw = randomBytes(32).toString('base64url');
    const passwordHash = await argon2.hash(randomPw, {
      type: argon2.argon2id,
      memoryCost: 64 * 1024,
      timeCost: 3,
      parallelism: 4,
    });

    // 이메일 없을 때 placeholder — provider id 기반 고유값.
    const email = params.email ?? `${params.provider}_${params.providerId}@noemail.local`;

    const created = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        name: params.name ?? null,
        emailVerified: !!params.email,
        [idField]: params.providerId,
      },
      select: { id: true },
    });
    return created.id;
  }
}
