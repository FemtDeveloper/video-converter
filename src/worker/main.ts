// Source maps optional in runtime; avoid requiring dev-only deps in production
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppConfig, configuration } from '../config/configuration';
import { validationSchema } from '../config/validation';
import { PrismaModule } from '../common/prisma/prisma.module';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisModule } from '../common/redis/redis.module';
import { RedisService } from '../common/redis/redis.service';
import { JobsModule } from '../modules/jobs/jobs.module';
import { JobsService } from '../modules/jobs/jobs.service';
import { RenderingModule } from '../modules/rendering/rendering.module';
import { RenderingService } from '../modules/rendering/rendering.service';
import { CaptioningService } from '../modules/rendering/captioning.service';
import { Queue, Worker } from 'bullmq';
import { AnyVideoJobPayload } from '../modules/queue/types';
import * as fs from 'fs/promises';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validationSchema }),
    PrismaModule,
    RedisModule,
    JobsModule,
    RenderingModule,
  ],
})
class WorkerModule {}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['log', 'error', 'warn'],
  });
  const config = app.get(ConfigService<AppConfig>);
  const redis = app.get(RedisService);
  const jobsService = app.get(JobsService);
  const rendering = app.get(RenderingService);
  const captioning = app.get(CaptioningService);

  const rawName = process.env.QUEUE_NAME_VIDEO_JOBS || 'video_jobs';
  const queueName = rawName.replace(/:/g, '_');
  const concurrency = parseInt(process.env.WORKER_CONCURRENCY || '1', 10);
  const redisUrl = config.getOrThrow<string>('redis.url', { infer: true });

  const worker = new Worker<AnyVideoJobPayload>(
    queueName,
    async (job) => {
      const payload = job.data;
      if (payload.type === 'IMAGE_TO_VIDEO') {
        const dto = payload.dto as any;
        await rendering.processImageToVideoForJob({
          jobId: payload.jobId,
          inputPath: payload.inputPath,
          originalName: payload.originalName,
          mimeType: payload.mimeType,
          dto,
        });
      } else if (payload.type === 'VIDEO_CAPTION') {
        const dto = payload.dto as any;
        await captioning.captionizeVideoForJob({
          jobId: payload.jobId,
          inputPath: payload.inputPath,
          originalName: payload.originalName,
          mimeType: payload.mimeType,
          options: {
            style: dto.style,
            backendOverride: dto.backend,
            fontSizeOverride: dto.fontSize,
            outlineColorHex: dto.outlineColor,
            textColorHex: dto.textColor,
            bgColorHex: dto.bgColor,
            bgOpacity: dto.bgOpacity,
            bgEnabled: dto.bgEnabled,
            position: dto.position,
            language: dto.language,
            karaoke: dto.karaoke,
            karaokeMode: dto.karaokeMode,
            karaokeOffsetMs: dto.karaokeOffsetMs,
            karaokeScale: dto.karaokeScale,
          },
        });
      }
      return true;
    },
    { connection: { url: redisUrl, maxRetriesPerRequest: null } as any, concurrency },
  );

  worker.on('failed', (job, err) => {
    // JobsService.markFailed ya es llamado por servicios; esto es por diagnóstico
    console.error(`Job ${job?.id} failed in worker:`, err?.message);
  });

  console.log(`Worker started on queue ${queueName} with concurrency ${concurrency}`);
}

bootstrap().catch((e) => {
  console.error('Worker bootstrap failed', e);
  process.exit(1);
});
