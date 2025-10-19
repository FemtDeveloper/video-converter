import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import { createReadStream } from 'fs';
import * as path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { extension as mimeExtension } from 'mime-types';
import { JobsService } from '../jobs/jobs.service';
import { ApiKeyValidationResult } from '../auth/api-key.service';
import { VideoFromImageDto } from './dto/video-from-image.dto';
import { AppConfig } from '../../config/configuration';
import { JobType } from '@prisma/client';

interface ProcessImageToVideoOptions {
  fileBuffer: Buffer;
  originalName: string;
  mimeType: string;
  dto: VideoFromImageDto;
  authContext: ApiKeyValidationResult;
}

interface ProcessImageToVideoResult {
  jobId: string;
  outputPath: string;
  outputMimeType: string;
  durationSeconds: number;
  filename: string;
  fileStream: ReturnType<typeof createReadStream>;
  fileSizeBytes: number;
}

@Injectable()
export class RenderingService {
  private readonly logger = new Logger(RenderingService.name);
  private readonly tempBasePath: string;
  private readonly outputBasePath: string;
  private readonly maxDurationSeconds: number;
  private readonly captionFontFile: string | null;

  constructor(
    private readonly configService: ConfigService<AppConfig>,
    private readonly jobsService: JobsService,
  ) {
    this.tempBasePath = this.configService.getOrThrow('paths.temp', { infer: true });
    this.outputBasePath = this.configService.getOrThrow('paths.outputs', { infer: true });
    this.maxDurationSeconds = this.configService.getOrThrow('limits.maxVideoDurationSeconds', { infer: true });
    const fontFile = this.configService.get('captioning.fontFile', { infer: true });
    this.captionFontFile = fontFile ? fontFile.trim() || null : null;
  }

  private async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.tempBasePath, { recursive: true });
    await fs.mkdir(this.outputBasePath, { recursive: true });
  }

  private sanitizeFileName(originalName: string, fallbackExtension: string): string {
    const safeBase = originalName.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 40) || 'image';
    return `${safeBase}.${fallbackExtension}`;
  }

  private buildOutputFileName(jobId: string, format: string): string {
    return `${jobId}.${format}`;
  }

  async processImageToVideo(options: ProcessImageToVideoOptions): Promise<ProcessImageToVideoResult> {
    await this.ensureDirectories();

    const { fileBuffer, originalName, mimeType, dto, authContext } = options;
    const durationSeconds = Math.min(dto.durationSeconds ?? 5, this.maxDurationSeconds);
    const fps = dto.fps ?? 30;
    const backgroundColor = dto.backgroundColor ?? '#000000';
    const format: 'mp4' = dto.format ?? 'mp4';
    const captionText = dto.captionText?.trim();
    const captionFontSize = dto.captionFontSize ?? 48;
    const captionTextColor = dto.captionTextColor ?? '#FFFFFF';
    const captionBackgroundColor = dto.captionBackgroundColor ?? '#000000';

    const extension = mimeExtension(mimeType) || 'bin';
    const sanitizedInputName = this.sanitizeFileName(originalName, extension);

    const job = await this.jobsService.createJob({
      organizationId: authContext.organizationId,
      type: JobType.IMAGE_TO_VIDEO,
      requestPayload: {
        durationSeconds,
        fps,
        format,
        backgroundColor,
        originalName,
        mimeType,
        captionText,
        captionFontSize,
        captionTextColor,
        captionBackgroundColor,
      },
    });

    const jobTempDir = path.join(this.tempBasePath, job.id);
    await fs.mkdir(jobTempDir, { recursive: true });
    const inputPath = path.join(jobTempDir, sanitizedInputName);
    await fs.writeFile(inputPath, fileBuffer);

    const outputFileName = dto.filename ?? this.buildOutputFileName(job.id, format);
    const outputPath = path.join(this.outputBasePath, outputFileName);

    try {
      await this.runFfmpeg({
        inputPath,
        outputPath,
        durationSeconds,
        fps,
        backgroundColor,
        captionText,
        captionFontSize,
        captionTextColor,
        captionBackgroundColor,
      });

      await fs.chmod(outputPath, 0o640);
      const stats = await fs.stat(outputPath);

      await this.jobsService.markCompleted({
        jobId: job.id,
        durationSeconds,
        resultPath: outputPath,
        outputMimeType: 'video/mp4',
        outputSizeBytes: stats.size,
      });

      const fileStream = createReadStream(outputPath);

      return {
        jobId: job.id,
        outputPath,
        outputMimeType: 'video/mp4',
        durationSeconds,
        filename: outputFileName,
        fileStream,
        fileSizeBytes: stats.size,
      };
    } catch (error) {
      await this.jobsService.markFailed(job.id, error as Error);
      await this.safeUnlink(outputPath);
      throw error;
    } finally {
      await this.safeUnlink(inputPath);
      await this.safeRemoveDirectory(jobTempDir);
    }
  }

  private async runFfmpeg(options: {
    inputPath: string;
    outputPath: string;
    durationSeconds: number;
    fps: number;
    backgroundColor: string;
    captionText?: string;
    captionFontSize?: number;
    captionTextColor?: string;
    captionBackgroundColor?: string;
  }): Promise<void> {
    const {
      inputPath,
      outputPath,
      durationSeconds,
      fps,
      backgroundColor,
      captionText,
      captionFontSize,
      captionTextColor,
      captionBackgroundColor,
    } = options;

    const baseFilter = `scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=${backgroundColor},setsar=1`;
    const filterWithCaption = captionText
      ? `${baseFilter},${this.buildCaptionFilter({
          text: captionText,
          fontSize: captionFontSize ?? 48,
          textColor: captionTextColor ?? '#FFFFFF',
          boxColor: captionBackgroundColor ?? '#000000',
        })}`
      : baseFilter;

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .inputOptions(['-loop', '1'])
        .outputOptions([
          `-t ${durationSeconds}`,
          `-r ${fps}`,
          '-c:v libx264',
          '-pix_fmt yuv420p',
          '-movflags +faststart',
          `-vf ${filterWithCaption}`,
        ])
        .on('error', (error) => reject(error))
        .on('end', () => resolve())
        .save(outputPath);
    });
  }

  private async safeUnlink(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(`Failed to remove file ${filePath}: ${(error as Error).message}`);
      }
    }
  }

  private async safeRemoveDirectory(dirPath: string): Promise<void> {
    try {
      await fs.rmdir(dirPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(`Failed to remove temp directory ${dirPath}: ${(error as Error).message}`);
      }
    }
  }

  private buildCaptionFilter(options: {
    text: string;
    fontSize: number;
    textColor: string;
    boxColor: string;
  }): string {
    const sanitizedText = this.escapeDrawtextText(options.text);
    const fontColor = this.ffmpegColorFromHex(options.textColor);
    const boxColor = this.ffmpegColorFromHex(options.boxColor, 0.6);
    const fontFile = this.captionFontFile;
    const fontFileFragment = fontFile ? `fontfile=${this.escapeDrawtextPath(fontFile)}` : '';

    const parts = [
      `drawtext=text=${sanitizedText}`,
      `fontcolor=${fontColor}`,
      `fontsize=${options.fontSize}`,
      'box=1',
      `boxcolor=${boxColor}`,
      'boxborderw=40',
      `x=(w-text_w)/2`,
      `y=h-(text_h*2.5)`,
      `line_spacing=8`,
      `shadowcolor=0x000000@0.4`,
      'shadowx=0',
      'shadowy=4',
    ];

    if (fontFileFragment) {
      parts.push(fontFileFragment);
    }

    return parts.join(':');
  }

  private escapeDrawtextText(text: string): string {
    return `'${text.replace(/['\\:\n\r]/g, (match) => {
      if (match === '\n' || match === '\r') {
        return '\\n';
      }
      return `\\${match}`;
    })}'`;
  }

  private escapeDrawtextPath(pathValue: string): string {
    return pathValue.replace(/\\/g, '/').replace(/:/g, '\\\\:');
  }

  private ffmpegColorFromHex(hexColor: string, alpha = 1): string {
    const normalized = hexColor.replace('#', '').toUpperCase();
    const clampedAlpha = Math.min(Math.max(alpha, 0), 1);
    return `0x${normalized}@${clampedAlpha.toFixed(2)}`;
  }
}
