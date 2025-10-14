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

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = parseInt(process.env.MAX_IMAGE_UPLOAD_MB ?? '5', 10) * 1024 * 1024;

@Controller('api/v1')
@UseGuards(ApiKeyGuard)
export class RenderingController {
  private readonly maxImageBytes: number;

  constructor(
    private readonly renderingService: RenderingService,
    private readonly configService: ConfigService<AppConfig>,
  ) {
    const maxMb = this.configService.get<number>('limits.maxImageUploadMb', { infer: true });
    this.maxImageBytes = maxMb * 1024 * 1024;
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

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
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
}
