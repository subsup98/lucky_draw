import {
  BadRequestException,
  Controller,
  Delete,
  HttpCode,
  Logger,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, resolve, normalize, sep } from 'path';
import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import type { Request } from 'express';
import { AdminAuthContext, AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';
import { CurrentAdmin } from '../admin-auth/current-admin.decorator';
import { extractAuditCtx } from '../audit-log/audit-context';
import { AuditLogService } from '../audit-log/audit-log.service';

export const UPLOAD_DIR = resolve(process.cwd(), 'uploads');
export const PUBLIC_UPLOAD_PATH = '/uploads';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * 관리자 이미지 업로드.
 *
 * - 저장소: 로컬 디스크 `apps/backend/uploads/` (main.ts 에서 `/uploads` 로 정적 서빙).
 * - 파일명: `randomBytes(16).hex + 확장자` — 원본 이름 노출 안 함.
 * - 검증: MIME(이미지 4종) + 5MB 한도.
 * - 응답: `{ url: "/uploads/xxx.png" }` — 프런트는 이 상대경로를 그대로 imageUrl 필드로 사용.
 * - 삭제: 관리자만. 디스크 파일 제거 (DB에 남은 참조는 별도 정리 — 보통 필드만 null 로).
 */
@Controller('admin/upload')
@UseGuards(AdminJwtAuthGuard)
export class UploadController {
  private readonly logger = new Logger(UploadController.name);

  constructor(private readonly audit: AuditLogService) {}

  @Post('image')
  @HttpCode(201)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: async (_req, _file, cb) => {
          await fs.mkdir(UPLOAD_DIR, { recursive: true });
          cb(null, UPLOAD_DIR);
        },
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname || '').toLowerCase().slice(0, 6);
          const name = `${randomBytes(16).toString('hex')}${ext}`;
          cb(null, name);
        },
      }),
      limits: { fileSize: MAX_SIZE, files: 1 },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME.includes(file.mimetype)) {
          return cb(new BadRequestException(`허용되지 않은 파일 형식: ${file.mimetype}`), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadImage(
    @CurrentAdmin() admin: AdminAuthContext,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException('file required (field name: "file")');
    const url = `${PUBLIC_UPLOAD_PATH}/${file.filename}`;
    await this.audit.record({
      actorType: 'ADMIN',
      adminUserId: admin.id,
      action: 'UPLOAD_IMAGE',
      targetType: 'Upload',
      targetId: file.filename,
      metadata: { url, size: file.size, mime: file.mimetype, original: file.originalname },
      ctx: extractAuditCtx(req),
    });
    return { url, size: file.size, mime: file.mimetype };
  }

  @Delete(':filename')
  @HttpCode(204)
  async removeImage(
    @CurrentAdmin() admin: AdminAuthContext,
    @Param('filename') filename: string,
    @Req() req: Request,
  ) {
    // path traversal 방어: 파일명에 경로 구분자가 끼면 거부.
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      throw new BadRequestException('invalid filename');
    }
    const target = normalize(resolve(UPLOAD_DIR, filename));
    if (!target.startsWith(UPLOAD_DIR + sep)) {
      throw new BadRequestException('invalid filename');
    }
    try {
      await fs.unlink(target);
    } catch (err) {
      // 이미 없으면 멱등 — 에러 삼키고 audit 에만 메모
      this.logger.warn(`delete image miss: ${filename} (${String(err)})`);
    }
    await this.audit.record({
      actorType: 'ADMIN',
      adminUserId: admin.id,
      action: 'UPLOAD_IMAGE_DELETE',
      targetType: 'Upload',
      targetId: filename,
      ctx: extractAuditCtx(req),
    });
  }
}
