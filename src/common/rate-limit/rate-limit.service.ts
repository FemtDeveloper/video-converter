import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { AppConfig } from '../../config/configuration';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
  limit: number;
}

@Injectable()
export class RateLimitService {
  private readonly windowSeconds: number;
  private readonly maxRequests: number;

  constructor(
    private readonly configService: ConfigService<AppConfig>,
    private readonly redisService: RedisService,
  ) {
    this.windowSeconds = this.configService.getOrThrow('rateLimit.windowSeconds', { infer: true });
    this.maxRequests = this.configService.getOrThrow('rateLimit.maxRequests', { infer: true });
  }

  async consume(key: string): Promise<RateLimitResult> {
    const client = this.redisService.getClient();
    const redisKey = `rl:${key}`;
    const count = await client.incr(redisKey);

    if (count === 1) {
      await client.expire(redisKey, this.windowSeconds);
    }

    const ttl = await client.ttl(redisKey);
    const allowed = count <= this.maxRequests;
    const remaining = Math.max(this.maxRequests - count, 0);

    return {
      allowed,
      remaining,
      resetSeconds: ttl > 0 ? ttl : this.windowSeconds,
      limit: this.maxRequests,
    };
  }

  buildHeaders(result: RateLimitResult): Record<string, string> {
    return {
      'x-ratelimit-limit': String(result.limit),
      'x-ratelimit-remaining': String(result.remaining),
      'x-ratelimit-reset': String(result.resetSeconds),
    };
  }
}
