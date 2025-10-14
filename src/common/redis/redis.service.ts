import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis, { RedisOptions } from "ioredis";
import { AppConfig } from "../../config/configuration";

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(private readonly configService: ConfigService<AppConfig>) {
    const redisUrl = this.configService.getOrThrow<string>('redis.url', { infer: true });
    const options: RedisOptions = {
      enableReadyCheck: true,
      lazyConnect: false,
      maxRetriesPerRequest: 3,
      reconnectOnError: () => true,
    };

    this.client = new Redis(redisUrl, options);
    this.client.on("connect", () => this.logger.log("Connected to Redis"));
    this.client.on("error", (error) => this.logger.error("Redis error: " + error.message));
    this.client.on("end", () => this.logger.warn("Redis connection closed"));
  }

  getClient(): Redis {
    return this.client;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
    this.logger.log("Redis connection terminated");
  }
}
