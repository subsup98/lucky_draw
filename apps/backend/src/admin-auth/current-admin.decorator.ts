import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AdminAuthContext } from './admin-jwt-auth.guard';

export const CurrentAdmin = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AdminAuthContext | undefined => {
    const req = ctx.switchToHttp().getRequest<Request & { admin?: AdminAuthContext }>();
    return req.admin;
  },
);
