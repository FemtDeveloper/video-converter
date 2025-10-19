import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { RenderingService } from './rendering.service';
import { VideoFromImageDto } from './dto/video-from-image.dto';
import { ApiKeyGuard } from '../auth/api-key.guard';
import type { AuthenticatedRequest } from '../auth/api-key.guard';
import { AppConfig } from '../../config/configuration';
import { CaptioningService } from './captioning.service';
import { CaptionizeVideoDto } from './dto/captionize-video.dto';

const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/x-m4v']);
const MAX_IMAGE_BYTES = parseInt(process.env.MAX_IMAGE_UPLOAD_MB ?? '5', 10) * 1024 * 1024;
const MAX_VIDEO_BYTES = parseInt(process.env.MAX_VIDEO_UPLOAD_MB ?? '200', 10) * 1024 * 1024;

@Controller('api/v1')
@UseGuards(ApiKeyGuard)
export class RenderingController {
  private readonly maxImageBytes: number;
  private readonly maxVideoBytes: number;

  constructor(
    private readonly renderingService: RenderingService,
    private readonly captioningService: CaptioningService,
    private readonly configService: ConfigService<AppConfig>,
  ) {
    const maxMb = this.configService.get<number>('limits.maxImageUploadMb', { infer: true });
    this.maxImageBytes = maxMb * 1024 * 1024;
    const maxVideoMb = this.configService.get<number>('limits.maxVideoUploadMb', { infer: true });
    this.maxVideoBytes = maxVideoMb * 1024 * 1024;
  }

  @Post('video-from-image')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: {
        fileSize: MAX_IMAGE_BYTES,
      },
    }),
  )
  async createVideoFromImage(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: VideoFromImageDto,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    if (!file) {
      throw new BadRequestException('Missing image file');
    }

    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Unsupported image MIME type');
    }

    if (file.size > this.maxImageBytes) {
      throw new BadRequestException('Image exceeds maximum size of 5MB');
    }

    if (!req.authContext) {
      throw new BadRequestException('Unauthorized request');
    }

    const result = await this.renderingService.processImageToVideo({
      fileBuffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      dto,
      authContext: req.authContext,
    });

    res.setHeader('Content-Type', result.outputMimeType);
    res.setHeader('Content-Length', result.fileSizeBytes.toString());
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('X-Job-Id', result.jobId);

    result.fileStream.pipe(res);
  }

  @Post('captionize')
  @UseInterceptors(
    FileInterceptor('video', {
      storage: memoryStorage(),
      limits: {
        fileSize: MAX_VIDEO_BYTES,
      },
    }),
  )
  async captionizeVideo(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CaptionizeVideoDto,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    if (!file) {
      throw new BadRequestException('Missing video file');
    }

    if (!ALLOWED_VIDEO_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Unsupported video MIME type');
    }

    if (file.size > this.maxVideoBytes) {
      throw new BadRequestException('Video exceeds maximum size limit');
    }

    if (!req.authContext) {
      throw new BadRequestException('Unauthorized request');
    }

    const result = await this.captioningService.captionizeVideo({
      fileBuffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      authContext: req.authContext,
      style: dto.style,
      backendOverride: dto.backend,
    });

    res.setHeader('Content-Type', result.outputMimeType);
    res.setHeader('Content-Length', result.fileSizeBytes.toString());
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('X-Job-Id', result.jobId);
    res.setHeader('X-Subtitles-Filename', result.subtitleFilename);
    res.setHeader('X-Transcript-Backend', result.backendUsed);

    result.fileStream.pipe(res);
  }
}
