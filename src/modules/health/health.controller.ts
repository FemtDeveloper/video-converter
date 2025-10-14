import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  @Get()
  async check() {
    const checks = {
      database: false,
      redis: false,
    };

    try {
      await this.prismaService.$queryRaw`SELECT 1`;
      checks.database = true;
    } catch (error) {
      checks.database = false;
    }

    try {
      await this.redisService.getClient().ping();
      checks.redis = true;
    } catch (error) {
      checks.redis = false;
    }

    return {
      status: checks.database && checks.redis ? 'ok' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    };
  }
}
