import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Req,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import type { Response } from 'express';
import { JobsService } from './jobs.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import type { AuthenticatedRequest } from '../auth/api-key.guard';
import { JobStatus } from '@prisma/client';
import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { QueueService } from '../queue/queue.service';

const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/x-m4v']);
const MAX_IMAGE_BYTES = parseInt(process.env.MAX_IMAGE_UPLOAD_MB ?? '5', 10) * 1024 * 1024;
const MAX_VIDEO_BYTES = parseInt(process.env.MAX_VIDEO_UPLOAD_MB ?? '200', 10) * 1024 * 1024;

@Controller('api/v1/jobs')
@UseGuards(ApiKeyGuard)
export class JobsController {
  private readonly tempBasePath: string;
  private readonly outputBasePath: string;

  constructor(
    private readonly jobsService: JobsService,
    private readonly queueService: QueueService,
    private readonly configService: ConfigService<AppConfig>,
  ) {
    this.tempBasePath = this.configService.getOrThrow('paths.temp', { infer: true });
    this.outputBasePath = this.configService.getOrThrow('paths.outputs', { infer: true });
    // Ensure generic uploads dir exists for diskStorage
    try {
      const uploads = path.join(this.tempBasePath, 'uploads');
      require('fs').mkdirSync(uploads, { recursive: true });
    } catch {}
  }

  @Post('video-from-image')
  @HttpCode(202)
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: '/app/tmp/jobs/uploads',
        filename: (_req, file, cb) => {
          const safe = file.originalname.replace(/[^a-zA-Z0-9-_\.]/g, '_');
          cb(null, `${Date.now()}-${safe}`);
        },
      }),
      limits: { fileSize: MAX_IMAGE_BYTES },
    }),
  )
  async enqueueImageToVideo(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: any,
    @Res() res: Response,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!req.authContext) throw new BadRequestException('Unauthorized request');
    if (!file) throw new BadRequestException('Missing image file');
    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) throw new BadRequestException('Unsupported image MIME type');

    const job = await this.jobsService.createQueuedJob({
      organizationId: req.authContext.organizationId,
      type: 'IMAGE_TO_VIDEO',
      requestPayload: { ...dto, originalName: file.originalname, mimeType: file.mimetype },
    });

    const jobTempDir = path.join(this.tempBasePath, job.id);
    await fs.mkdir(jobTempDir, { recursive: true });
    const uploadedPath = (file as any).path as string;
    const inputPath = path.join(jobTempDir, file.originalname.replace(/[^a-zA-Z0-9-_\.]/g, '_'));
    await fs.rename(uploadedPath, inputPath);

    await this.queueService.addJob({
      jobId: job.id,
      organizationId: job.organizationId,
      type: 'IMAGE_TO_VIDEO',
      inputPath,
      originalName: file.originalname,
      mimeType: file.mimetype,
      dto,
    });

    res.json({ jobId: job.id, status: 'queued' });
  }

  @Post('captionize')
  @HttpCode(202)
  @UseInterceptors(
    FileInterceptor('video', {
      storage: diskStorage({
        destination: '/app/tmp/jobs/uploads',
        filename: (_req, file, cb) => {
          const safe = file.originalname.replace(/[^a-zA-Z0-9-_\.]/g, '_');
          cb(null, `${Date.now()}-${safe}`);
        },
      }),
      limits: { fileSize: MAX_VIDEO_BYTES },
    }),
  )
  async enqueueCaptionize(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: any,
    @Res() res: Response,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!req.authContext) throw new BadRequestException('Unauthorized request');
    if (!file) throw new BadRequestException('Missing video file');
    if (!ALLOWED_VIDEO_MIME_TYPES.has(file.mimetype)) throw new BadRequestException('Unsupported video MIME type');
    if (!dto?.language) throw new BadRequestException('language is required');

    const job = await this.jobsService.createQueuedJob({
      organizationId: req.authContext.organizationId,
      type: 'VIDEO_CAPTION',
      requestPayload: { ...dto, originalName: file.originalname, mimeType: file.mimetype },
    });

    const jobTempDir = path.join(this.tempBasePath, job.id);
    await fs.mkdir(jobTempDir, { recursive: true });
    const uploadedPath = (file as any).path as string;
    const inputPath = path.join(jobTempDir, 'input.mp4');
    await fs.rename(uploadedPath, inputPath);

    await this.queueService.addJob({
      jobId: job.id,
      organizationId: job.organizationId,
      type: 'VIDEO_CAPTION',
      inputPath,
      originalName: file.originalname,
      mimeType: file.mimetype,
      dto,
    });

    res.json({ jobId: job.id, status: 'queued' });
  }

  @Get(':id')
  async getStatus(@Param('id') id: string, @Req() req: AuthenticatedRequest, @Res() res: Response) {
    const job = await this.jobsService.getJobById(id);
    if (!job || job.organizationId !== req.authContext?.organizationId) {
      throw new NotFoundException('Job not found');
    }
    res.json({
      jobId: job.id,
      type: job.type,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt,
      output: job.status === JobStatus.COMPLETED ? {
        videoPath: job.resultPath,
        subtitlePath: job.resultSubtitlePath ?? null,
        outputMimeType: job.outputMimeType,
        outputSizeBytes: job.outputSizeBytes,
      } : null,
      errorMessage: job.errorMessage ?? null,
    });
  }

  @Get(':id/artifacts')
  async downloadArtifact(
    @Param('id') id: string,
    @Query('file') file: 'video' | 'subtitle' = 'video',
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const job = await this.jobsService.getJobById(id);
    if (!job || job.organizationId !== req.authContext?.organizationId) {
      throw new NotFoundException('Job not found');
    }
    if (job.status !== JobStatus.COMPLETED) {
      throw new BadRequestException('Job is not completed');
    }

    const filePath = file === 'subtitle' ? job.resultSubtitlePath : job.resultPath;
    if (!filePath || !existsSync(filePath)) {
      throw new NotFoundException('Artifact not found');
    }
    const filename = path.basename(filePath);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', file === 'subtitle' ? 'text/plain; charset=utf-8' : (job.outputMimeType || 'application/octet-stream'));
    res.sendFile(filePath);
  }
}
