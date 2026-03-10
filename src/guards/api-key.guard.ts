import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

/**
 * Apply this decorator to a controller or handler to skip API key checking
 * on that specific route even when the guard is registered globally.
 *
 * @example
 * ```ts
 * @Public()
 * @Get('health')
 * healthCheck() { return { status: 'ok' }; }
 * ```
 */
export const Public = () =>
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  (Reflect as unknown as { metadata: (k: string, v: boolean) => MethodDecorator })
    .metadata('isPublic', true);

/**
 * Guard that enforces API key authentication via the `x-api-key` request header.
 *
 * Behavior:
 * - If `API_KEY` env var is **not set**, the guard passes every request (dev mode).
 * - If `API_KEY` is set, the guard requires the header to match exactly.
 * - Routes decorated with `@Public()` are always allowed through.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);
  private readonly requiredKey: string | undefined;

  constructor(private readonly reflector: Reflector) {
    this.requiredKey = process.env.API_KEY;

    if (!this.requiredKey) {
      this.logger.warn(
        'API_KEY env var is not set — API key protection is DISABLED',
      );
    }
  }

  canActivate(context: ExecutionContext): boolean {
    // Skip if no API key is configured
    if (!this.requiredKey) return true;

    // Allow routes explicitly marked @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = request.headers['x-api-key'];

    if (providedKey !== this.requiredKey) {
      throw new UnauthorizedException('Invalid or missing API key');
    }

    return true;
  }
}
