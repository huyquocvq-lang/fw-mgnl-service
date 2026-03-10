import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PackagesModule } from './packages/packages.module';
import { ApiKeyGuard } from './guards/api-key.guard';

@Module({
  imports: [PackagesModule],
  providers: [
    /**
     * Register ApiKeyGuard globally so every route is protected by default.
     * Individual routes can opt out with the @Public() decorator.
     * When API_KEY env var is absent the guard is a no-op (see guard impl).
     */
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
  ],
})
export class AppModule {}
