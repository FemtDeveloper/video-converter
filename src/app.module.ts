import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configuration } from './config/configuration';
import { validationSchema } from './config/validation';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { RateLimitModule } from './common/rate-limit/rate-limit.module';
import { HealthModule } from './modules/health/health.module';
import { RenderingModule } from './modules/rendering/rendering.module';
import { PlanModule } from './modules/plan/plan.module';
import { AuthModule } from './modules/auth/auth.module';
import { JobsModule } from './modules/jobs/jobs.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
    }),
    PrismaModule,
    RedisModule,
    RateLimitModule,
    AuthModule,
    JobsModule,
    HealthModule,
    RenderingModule,
    PlanModule,
  ],
})
export class AppModule {}
