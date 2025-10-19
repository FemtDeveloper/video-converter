import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import { createReadStream } from 'fs';
import * as path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { ApiKeyValidationResult } from '../auth/api-key.service';
import { JobsService } from '../jobs/jobs.service';
import { AppConfig } from '../../config/configuration';
import { SubtitleTranscriberService } from './subtitle-transcriber.service';
import { JobType } from '@prisma/client';

interface CaptionizeOptions {
  fileBuffer: Buffer;
  originalName: string;
  mimeType: string;
  authContext: ApiKeyValidationResult;
  style?: 'instagram' | 'clean';
  backendOverride?: 'vosk' | 'whisper' | 'mock';
}

interface CaptionizeResult {
  jobId: string;
  outputPath: string;
  outputMimeType: string;
  filename: string;
  fileStream: ReturnType<typeof createReadStream>;
  fileSizeBytes: number;
  subtitlePath: string;
  subtitleFilename: string;
  durationSeconds: number;
  backendUsed: 'vosk' | 'whisper' | 'mock';
}

interface StylePreset {
  name: string;
  header: string;
  bodyTemplate: string;
}

const STYLE_TEMPLATES: Record<'instagram' | 'clean', StylePreset> = {
  instagram: {
    name: 'Instagram Inspired',
    header: `[Script Info]
ScriptType: v4.00+
Collisions: Normal
PlayResX: 1080
PlayResY: 1920
Timer: 100.0000

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,64,&H00FFFFFF,&H000000FF,&H66000000,&H66000000,-1,0,0,0,100,100,0,0,3,4,0,2,80,80,120,0

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`,
    bodyTemplate: 'Dialogue: 0,{start},{end},Default,,0,0,0,,{text}',
  },
  clean: {
    name: 'Clean Centered',
    header: `[Script Info]
ScriptType: v4.00+
Collisions: Normal
PlayResX: 1080
PlayResY: 1920
Timer: 100.0000

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,56,&H00FFFFFF,&H000000FF,&HBF000000,&H80000000,0,0,0,0,100,100,0,0,3,3,0,2,80,80,100,0

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`,
    bodyTemplate: 'Dialogue: 0,{start},{end},Default,,0,0,0,,{text}',
  },
};

@Injectable()
export class CaptioningService {
  private readonly logger = new Logger(CaptioningService.name);
  private readonly tempBasePath: string;
  private readonly outputBasePath: string;
  private readonly defaultStyle: 'instagram' | 'clean';

  constructor(
    private readonly configService: ConfigService<AppConfig>,
    private readonly jobsService: JobsService,
    private readonly subtitleTranscriber: SubtitleTranscriberService,
  ) {
    this.tempBasePath = this.configService.getOrThrow('paths.temp', { infer: true });
    this.outputBasePath = this.configService.getOrThrow('paths.outputs', { infer: true });
    const style = this.configService.get('captioning.defaultStyle', { infer: true });
    this.defaultStyle = style === 'clean' ? 'clean' : 'instagram';
  }

  async captionizeVideo(options: CaptionizeOptions): Promise<CaptionizeResult> {
    await this.ensureDirectories();

    const { fileBuffer, originalName, mimeType, authContext, style, backendOverride } = options;
    const job = await this.jobsService.createJob({
      organizationId: authContext.organizationId,
      type: JobType.VIDEO_CAPTION,
      requestPayload: {
        originalName,
        mimeType,
        style: style ?? this.defaultStyle,
        backendOverride: backendOverride ?? null,
      },
    });

    const jobTempDir = path.join(this.tempBasePath, job.id);
    await fs.mkdir(jobTempDir, { recursive: true });
    const inputPath = path.join(jobTempDir, 'input.mp4');
    const audioPath = path.join(jobTempDir, 'audio.wav');
    const assPath = path.join(jobTempDir, 'captions.ass');

    await fs.writeFile(inputPath, fileBuffer);

    let outputPath: string | null = null;
    let subtitleOutputPath: string | null = null;

    try {
      const durationSeconds = await this.getVideoDurationSeconds(inputPath);
      await this.extractAudioToWav(inputPath, audioPath);

      const transcription = await this.subtitleTranscriber.transcribe(audioPath, {
        backend: backendOverride,
        approximateDurationSeconds: durationSeconds,
      });

      const segments = transcription.segments.length
        ? transcription.segments
        : [{ start: 0, end: Math.max(durationSeconds, 1), text: 'Transcripcion no disponible' }];

      const resolvedStyle = this.resolveStyle(style);
      const assContent = this.buildAssContent(segments, resolvedStyle);
      await fs.writeFile(assPath, assContent, 'utf8');

      const outputFileName = this.buildOutputFileName(job.id);
      outputPath = path.join(this.outputBasePath, outputFileName);
      subtitleOutputPath = path.join(this.outputBasePath, `${job.id}.ass`);

      await this.burnSubtitles({ inputPath, assPath, outputPath });

      await fs.copyFile(assPath, subtitleOutputPath);
      await fs.chmod(outputPath, 0o640);
      await fs.chmod(subtitleOutputPath, 0o640);

      if (!outputPath || !subtitleOutputPath) {
        throw new Error('Caption pipeline failed to generate expected outputs');
      }

      const stats = await fs.stat(outputPath);

      await this.jobsService.markCompleted({
        jobId: job.id,
        durationSeconds,
        resultPath: outputPath,
        outputMimeType: 'video/mp4',
        outputSizeBytes: stats.size,
        subtitlePath: subtitleOutputPath,
      });

      const fileStream = createReadStream(outputPath);

      return {
        jobId: job.id,
        outputPath,
        outputMimeType: 'video/mp4',
        filename: outputFileName,
        fileStream,
        fileSizeBytes: stats.size,
        subtitlePath: subtitleOutputPath,
        subtitleFilename: path.basename(subtitleOutputPath),
        durationSeconds,
        backendUsed: transcription.backend,
      };
    } catch (error) {
      if (outputPath) {
        await this.safeUnlink(outputPath);
      }
      if (subtitleOutputPath) {
        await this.safeUnlink(subtitleOutputPath);
      }
      await this.jobsService.markFailed(job.id, error as Error);
      throw error;
    } finally {
      await this.safeUnlink(inputPath);
      await this.safeUnlink(audioPath);
      await this.safeUnlink(assPath);
      await this.safeRemoveDirectory(jobTempDir);
    }
  }

  private async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.tempBasePath, { recursive: true });
    await fs.mkdir(this.outputBasePath, { recursive: true });
  }

  private buildOutputFileName(jobId: string): string {
    return `${jobId}.mp4`;
  }

  private resolveStyle(style?: 'instagram' | 'clean'): StylePreset {
    if (style && STYLE_TEMPLATES[style]) {
      return STYLE_TEMPLATES[style];
    }
    return STYLE_TEMPLATES[this.defaultStyle];
  }

  private async extractAudioToWav(inputPath: string, audioPath: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions(['-vn', '-acodec pcm_s16le', '-ar 16000', '-ac 1'])
        .format('wav')
        .on('error', (error) => reject(error))
        .on('end', () => resolve())
        .save(audioPath);
    });
  }

  private async getVideoDurationSeconds(filePath: string): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (error, metadata) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(metadata.format.duration ?? 0);
      });
    });
  }

  private buildAssContent(segments: { start: number; end: number; text: string }[], style: StylePreset): string {
    const body = segments
      .map((segment) => {
        const start = this.formatAssTimestamp(segment.start);
        const end = this.formatAssTimestamp(segment.end);
        const text = this.escapeAssText(segment.text);
        return style.bodyTemplate.replace('{start}', start).replace('{end}', end).replace('{text}', text);
      })
      .join('\n');

    return `${style.header}${body}\n`;
  }

  private formatAssTimestamp(seconds: number): string {
    const totalCentiseconds = Math.max(Math.round(seconds * 100), 0);
    const hours = Math.floor(totalCentiseconds / (100 * 60 * 60));
    const minutes = Math.floor((totalCentiseconds / (100 * 60)) % 60);
    const secs = Math.floor((totalCentiseconds / 100) % 60);
    const centiseconds = totalCentiseconds % 100;
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${centiseconds
      .toString()
      .padStart(2, '0')}`;
  }

  private escapeAssText(text: string): string {
    return text.replace(/\r?\n/g, '\\N').replace(/{/g, '(').replace(/}/g, ')');
  }

  private async burnSubtitles(options: { inputPath: string; assPath: string; outputPath: string }): Promise<void> {
    const filter = this.buildAssFilter(options.assPath);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(options.inputPath)
        .outputOptions([
          '-preset veryfast',
          '-crf 20',
          '-c:v libx264',
          '-pix_fmt yuv420p',
          '-movflags +faststart',
          '-c:a copy',
          `-vf ${filter}`,
        ])
        .on('error', (error) => reject(error))
        .on('end', () => resolve())
        .save(options.outputPath);
    });
  }

  private buildAssFilter(assPath: string): string {
    const escapedPath = this.escapePathForFilter(assPath);
    return `ass=${escapedPath}`;
  }

  private escapePathForFilter(filePath: string): string {
    return filePath.replace(/\\/g, '/').replace(/:/g, '\\\\:');
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
}
