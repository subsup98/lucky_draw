import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

/**
 * 이메일 발송 서비스 — SMTP provider 무관 (Gmail / Naver / Daum / Resend SMTP 등).
 * 베타 직전엔 도메인 + Resend/SES 등으로 교체 예정.
 *
 * 환경변수:
 *   EMAIL_PROVIDER      — 'gmail' | 'naver' | 'daum' | 'custom' (기본: gmail)
 *   EMAIL_USER          — 발신 이메일 주소
 *   EMAIL_APP_PASSWORD  — 앱 비밀번호 (공백 포함 OK, 자동 제거됨)
 *   EMAIL_HOST          — provider='custom' 일 때 SMTP 호스트
 *   EMAIL_PORT          — provider='custom' 일 때 포트 (기본 465)
 *   EMAIL_SECURE        — provider='custom' 일 때 'true'/'false' (기본 true)
 */
type ProviderPreset = { host: string; port: number; secure: boolean };

const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  gmail: { host: 'smtp.gmail.com', port: 465, secure: true },
  naver: { host: 'smtp.naver.com', port: 465, secure: true },
  daum: { host: 'smtp.daum.net', port: 465, secure: true },
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  private getTransporter(): nodemailer.Transporter {
    if (this.transporter) return this.transporter;

    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_APP_PASSWORD;
    if (!user || !pass) {
      throw new Error(
        'EMAIL_USER / EMAIL_APP_PASSWORD 환경변수가 설정되지 않았습니다.',
      );
    }

    const provider = (process.env.EMAIL_PROVIDER ?? 'gmail').toLowerCase();
    const preset = PROVIDER_PRESETS[provider];
    const config: ProviderPreset = preset ?? {
      host: process.env.EMAIL_HOST ?? '',
      port: Number(process.env.EMAIL_PORT ?? 465),
      secure: process.env.EMAIL_SECURE !== 'false',
    };
    if (!config.host) {
      throw new Error(
        `EMAIL_PROVIDER='${provider}' 가 인식되지 않습니다. 'gmail'/'naver'/'daum' 중 하나이거나 EMAIL_HOST 를 직접 설정하세요.`,
      );
    }

    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user, pass: pass.replace(/\s+/g, '') },
    });
    return this.transporter;
  }

  async sendCode(
    to: string,
    code: string,
    purpose: 'signup' | 'reset',
  ): Promise<void> {
    const subject =
      purpose === 'signup'
        ? '[Lucky Draw] 회원가입 인증 코드'
        : '[Lucky Draw] 비밀번호 재설정 코드';
    const text = [
      `요청하신 인증 코드: ${code}`,
      '',
      '이 코드는 5분 후 만료됩니다.',
      '본인이 요청하지 않았다면 이 메일을 무시해주세요.',
    ].join('\n');
    // 발신자 표시 이름 — 받는 사람한테 "Lucky Draw <foo@gmail.com>" 형태로 보임.
    const fromName = process.env.EMAIL_FROM_NAME ?? 'Lucky Draw';
    const fromAddress = process.env.EMAIL_USER!;
    const from = `${fromName} <${fromAddress}>`;
    try {
      await this.getTransporter().sendMail({ from, to, subject, text });
    } catch (err) {
      this.logger.error(
        `email send failed to=${to} purpose=${purpose}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw err;
    }
  }
}
