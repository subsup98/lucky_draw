import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AdminRole } from '@prisma/client';
import type { Request } from 'express';
import { AdminAuthService } from './admin-auth.service';
import { AdminJwtService } from './admin-jwt.service';

export interface AdminAuthContext {
  id: string;
  username: string;
  role: AdminRole;
  tokenVersion: number;
}

@Injectable()
export class AdminJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: AdminJwtService,
    private readonly adminAuth: AdminAuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { admin?: AdminAuthContext }>();
    const header = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException();
    const token = header.slice(7);

    let payload: { sub: string; tv: number; aud?: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException();
    }
    if (payload.aud !== 'admin') throw new UnauthorizedException();

    const admin = await this.adminAuth.findActiveAdmin(payload.sub);
    if (!admin || admin.tokenVersion !== payload.tv) {
      throw new UnauthorizedException();
    }
    req.admin = {
      id: admin.id,
      username: admin.username,
      role: admin.role,
      tokenVersion: admin.tokenVersion,
    };
    return true;
  }
}
