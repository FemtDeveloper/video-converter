import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, JobsOptions } from 'bullmq';
import { AppConfig } from '../../config/configuration';
import { RedisService } from '../../common/redis/redis.service';
import { AnyVideoJobPayload } from './types';

@Injectable()
export class QueueService {
  private readonly queue: Queue<AnyVideoJobPayload>;
  private readonly queueName: string;

  constructor(
    private readonly configService: ConfigService<AppConfig>,
    private readonly redisService: RedisService,
  ) {
    const rawName = process.env.QUEUE_NAME_VIDEO_JOBS || 'video_jobs';
    // BullMQ v5: queue name cannot contain ':'
    this.queueName = rawName.replace(/:/g, '_');
    // Usar opciones de conexión con maxRetriesPerRequest=null para compatibilidad total
    const redisUrl = this.configService.getOrThrow<string>('redis.url', { infer: true });
    this.queue = new Queue<AnyVideoJobPayload>(this.queueName, {
      connection: { url: redisUrl, maxRetriesPerRequest: null } as any,
    });
  }

  async addJob(payload: AnyVideoJobPayload, options?: JobsOptions): Promise<string> {
    const attempts = parseInt(process.env.QUEUE_ATTEMPTS || '1', 10);
    const backoff = parseInt(process.env.QUEUE_BACKOFF_MS || '15000', 10);
    const job = await this.queue.add(payload.type, payload, {
      removeOnComplete: 100,
      removeOnFail: 100,
      attempts,
      backoff: { type: 'exponential', delay: backoff },
      ...(options || {}),
    });
    return job.id as string;
  }
}
