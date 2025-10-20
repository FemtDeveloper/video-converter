import * as fs from 'fs/promises';
import * as path from 'path';

import { Injectable, Logger } from '@nestjs/common';

import { ApiKeyValidationResult } from '../auth/api-key.service';
import { AppConfig } from '../../config/configuration';
import { ConfigService } from '@nestjs/config';
import { JobType } from '@prisma/client';
import { JobsService } from '../jobs/jobs.service';
import { VideoFromImageDto } from './dto/video-from-image.dto';
import { createReadStream } from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import { extension as mimeExtension } from 'mime-types';

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
    this.tempBasePath = this.configService.getOrThrow('paths.temp', {
      infer: true,
    });
    this.outputBasePath = this.configService.getOrThrow('paths.outputs', {
      infer: true,
    });
    this.maxDurationSeconds = this.configService.getOrThrow(
      'limits.maxVideoDurationSeconds',
      { infer: true },
    );
    const fontFile = this.configService.get('captioning.fontFile', {
      infer: true,
    });
    this.captionFontFile = fontFile ? fontFile.trim() || null : null;
  }

  private async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.tempBasePath, { recursive: true });
    await fs.mkdir(this.outputBasePath, { recursive: true });
  }

  private sanitizeFileName(
    originalName: string,
    fallbackExtension: string,
  ): string {
    const safeBase =
      originalName.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 40) || 'image';
    return `${safeBase}.${fallbackExtension}`;
  }

  private buildOutputFileName(jobId: string, format: string): string {
    return `${jobId}.${format}`;
  }

  private resolveDrawtextStyle(
    style?:
      | 'instagram'
      | 'clean'
      | 'instagram_plus'
      | 'clean_plus'
      | 'upper'
      | 'caption_bar'
      | 'outline_color'
      | 'yellow_black'
      | 'white_blue'
      | 'white_black_yellow_outline'
      | 'neon_green_black'
      | 'red_white'
      | 'blue_white'
      | 'transparent_outline'
      | 'minimal',
  ): {
    textColor: string;
    outlineColor: string;
    outlineWidth: number;
    fontSize: number;
    position: 'top' | 'bottom';
    bgColor: string;
    bgOpacity: number;
  } {
    const s = style ?? 'instagram';
    switch (s) {
      case 'instagram':
        return {
          textColor: '#FFFFFF',
          outlineColor: '#000000',
          outlineWidth: 4,
          fontSize: 64,
          position: 'bottom',
          bgColor: '#000000',
          bgOpacity: 0.6,
        };
      case 'clean':
        return {
          textColor: '#FFFFFF',
          outlineColor: '#000000',
          outlineWidth: 3,
          fontSize: 56,
          position: 'bottom',
          bgColor: '#000000',
          bgOpacity: 0.5,
        };
      case 'instagram_plus':
        return {
          textColor: '#FFFFFF',
          outlineColor: '#000000',
          outlineWidth: 5,
          fontSize: 72,
          position: 'bottom',
          bgColor: '#000000',
          bgOpacity: 0.7,
        };
      case 'clean_plus':
        return {
          textColor: '#FFFFFF',
          outlineColor: '#000000',
          outlineWidth: 4,
          fontSize: 64,
          position: 'bottom',
          bgColor: '#000000',
          bgOpacity: 0.4,
        };
      case 'upper':
        return {
          textColor: '#FFFFFF',
          outlineColor: '#000000',
          outlineWidth: 5,
          fontSize: 64,
          position: 'top',
          bgColor: '#000000',
          bgOpacity: 0.6,
        };
      case 'caption_bar':
        return {
          textColor: '#FFFFFF',
          outlineColor: '#000000',
          outlineWidth: 6,
          fontSize: 68,
          position: 'bottom',
          bgColor: '#000000',
          bgOpacity: 0.6,
        };
      case 'outline_color':
        return {
          textColor: '#FFFFFF',
          outlineColor: '#FFFF00',
          outlineWidth: 6,
          fontSize: 80,
          position: 'bottom',
          bgColor: '#000000',
          bgOpacity: 0.0, // normalmente sin placa para este preset
        };
      case 'yellow_black':
        return {
          textColor: '#FFFF00',
          outlineColor: '#000000',
          outlineWidth: 5,
          fontSize: 68,
          position: 'bottom',
          bgColor: '#000000',
          bgOpacity: 0.6,
        };
      case 'white_blue':
        return {
          textColor: '#FFFFFF',
          outlineColor: '#000000',
          outlineWidth: 4,
          fontSize: 64,
          position: 'bottom',
          bgColor: '#0D6EFD',
          bgOpacity: 0.5,
        };
      case 'white_black_yellow_outline':
        return {
          textColor: '#FFFFFF',
          outlineColor: '#FFFF00',
          outlineWidth: 6,
          fontSize: 72,
          position: 'bottom',
          bgColor: '#000000',
          bgOpacity: 0.6,
        };
      case 'neon_green_black':
        return {
          textColor: '#39FF14',
          outlineColor: '#000000',
          outlineWidth: 5,
          fontSize: 72,
          position: 'bottom',
          bgColor: '#000000',
          bgOpacity: 0.6,
        };
      case 'red_white':
        return {
          textColor: '#FF2D2D',
          outlineColor: '#FFFFFF',
          outlineWidth: 5,
          fontSize: 68,
          position: 'bottom',
          bgColor: '#000000',
          bgOpacity: 0.0,
        };
      case 'blue_white':
        return {
          textColor: '#1877F2',
          outlineColor: '#000000',
          outlineWidth: 5,
          fontSize: 68,
          position: 'bottom',
          bgColor: '#FFFFFF',
          bgOpacity: 0.8,
        };
      case 'transparent_outline':
        return {
          textColor: '#FFFFFF',
          outlineColor: '#FFFF00',
          outlineWidth: 6,
          fontSize: 68,
          position: 'bottom',
          bgColor: '#000000',
          bgOpacity: 0.0,
        };
      case 'minimal':
        return {
          textColor: '#FFFFFF',
          outlineColor: '#000000',
          outlineWidth: 2,
          fontSize: 56,
          position: 'bottom',
          bgColor: '#000000',
          bgOpacity: 0.0,
        };
      default:
        return {
          textColor: '#FFFFFF',
          outlineColor: '#000000',
          outlineWidth: 4,
          fontSize: 64,
          position: 'bottom',
          bgColor: '#000000',
          bgOpacity: 0.6,
        };
    }
  }

  async processImageToVideo(
    options: ProcessImageToVideoOptions,
  ): Promise<ProcessImageToVideoResult> {
    await this.ensureDirectories();

    const { fileBuffer, originalName, mimeType, dto, authContext } = options;
    const durationSeconds = Math.min(
      dto.durationSeconds ?? 5,
      this.maxDurationSeconds,
    );
    const fps = dto.fps ?? 30;
    const backgroundColor = dto.backgroundColor ?? '#000000';
    const format: 'mp4' = dto.format ?? 'mp4';
    const captionText = dto.captionText?.trim();
    const preset = this.resolveDrawtextStyle(dto.style);
    const captionFontSize =
      dto.fontSize ?? dto.captionFontSize ?? preset.fontSize;
    const captionTextColor = dto.textColor ?? preset.textColor;
    const bgColor = dto.bgColor ?? preset.bgColor;
    const bgOpacity = dto.bgOpacity ?? preset.bgOpacity;
    const captionOutlineColor = dto.outlineColor ?? preset.outlineColor;
    const captionBorderWidth = dto.outlineWidth ?? preset.outlineWidth;
    const captionPosition = dto.position ?? preset.position;

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
        bgColor,
      },
    });

    const jobTempDir = path.join(this.tempBasePath, job.id);
    await fs.mkdir(jobTempDir, { recursive: true });
    const inputPath = path.join(jobTempDir, sanitizedInputName);
    await fs.writeFile(inputPath, fileBuffer);

    const outputFileName =
      dto.filename ?? this.buildOutputFileName(job.id, format);
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
        bgColor,
        bgOpacity,
        outlineColor: captionOutlineColor,
        borderWidth: captionBorderWidth,
        position: captionPosition,
        fillFrame: dto.fillFrame,
        boxEnabled: dto.bgEnabled === true,
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
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      await this.jobsService.markFailed(job.id, e);
      await this.safeUnlink(outputPath);
      throw e;
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
    bgColor?: string;
    bgOpacity?: number;
    outlineColor?: string;
    borderWidth?: number;
    position?: 'top' | 'bottom';
    fillFrame?: boolean;
    boxEnabled?: boolean;
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
      bgColor,
      bgOpacity,
      outlineColor,
      borderWidth,
      position,
      fillFrame,
    } = options;

    const baseFilter = fillFrame
      ? 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1'
      : `scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=${backgroundColor},setsar=1`;
    const filterWithCaption = captionText
      ? `${baseFilter},${this.buildCaptionFilter({
          text: captionText,
          fontSize: captionFontSize ?? 48,
          textColor: captionTextColor ?? '#FFFFFF',
          boxColor: bgColor ?? '#000000',
          boxAlpha: bgOpacity ?? 0.6,
          outlineColor,
          borderWidth,
          position,
          boxEnabled: options.boxEnabled !== false,
        })}`
      : baseFilter;

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .inputOptions(['-loop', '1'])
        .outputOptions([
          '-t',
          String(durationSeconds),
          '-r',
          String(fps),
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-movflags',
          '+faststart',
          '-vf',
          filterWithCaption,
        ])
        .on('error', (error) => reject(error))
        .on('end', () => resolve())
        .save(outputPath);
    });
  }

  private async safeUnlink(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err ? err.code : undefined;
      if (code !== 'ENOENT') {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to remove file ${filePath}: ${msg}`);
      }
    }
  }

  private async safeRemoveDirectory(dirPath: string): Promise<void> {
    try {
      await fs.rmdir(dirPath);
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err ? err.code : undefined;
      if (code !== 'ENOENT') {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to remove temp directory ${dirPath}: ${msg}`);
      }
    }
  }

  private buildCaptionFilter(options: {
    text: string;
    fontSize: number;
    textColor: string;
    boxColor: string;
    boxAlpha?: number;
    outlineColor?: string;
    borderWidth?: number;
    position?: 'top' | 'bottom';
    boxEnabled?: boolean;
  }): string {
    const sanitizedText = this.escapeDrawtextText(options.text);
    const fontColor = this.ffmpegColorFromHex(options.textColor);
    const boxColor = this.ffmpegColorFromHex(
      options.boxColor,
      options.boxAlpha ?? 0.6,
    );
    const fontFile = this.captionFontFile;
    const fontFileFragment = fontFile
      ? `fontfile=${this.escapeDrawtextPath(fontFile)}`
      : '';

    const parts = [
      `drawtext=text=${sanitizedText}`,
      `fontcolor=${fontColor}`,
      `fontsize=${options.fontSize}`,
      ...(options.boxEnabled === false
        ? []
        : (['box=1', `boxcolor=${boxColor}`, 'boxborderw=40'] as string[])),
      `x=(w-text_w)/2`,
      options.position === 'top' ? `y=(text_h*1.5)` : `y=h-(text_h*2.5)`,
      `line_spacing=8`,
      `shadowcolor=0x000000@0.4`,
      'shadowx=0',
      'shadowy=4',
    ];
    if (options.outlineColor) {
      const outline = this.ffmpegColorFromHex(options.outlineColor);
      parts.push(`bordercolor=${outline}`);
      parts.push(`borderw=${options.borderWidth ?? 6}`);
    }

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
