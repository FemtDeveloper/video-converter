import * as fs from 'fs/promises';
import * as path from 'path';

import { Injectable, Logger } from '@nestjs/common';

import { ApiKeyValidationResult } from '../auth/api-key.service';
import { AppConfig } from '../../config/configuration';
import { ConfigService } from '@nestjs/config';
import { JobType } from '@prisma/client';
import { JobsService } from '../jobs/jobs.service';
import { SubtitleTranscriberService } from './subtitle-transcriber.service';
import { createReadStream } from 'fs';
import ffmpeg from 'fluent-ffmpeg';

interface CaptionizeOptions {
  fileBuffer: Buffer;
  originalName: string;
  mimeType: string;
  authContext: ApiKeyValidationResult;
  style?:
    | 'instagram'
    | 'clean'
    | 'instagram_plus'
    | 'clean_plus'
    | 'upper'
    | 'caption_bar'
    | 'outline_color';
  backendOverride?: 'vosk' | 'whisper' | 'mock';
  fontSizeOverride?: number;
  outlineColorHex?: string;
  position?: 'top' | 'bottom';
  textColorHex?: string;
  bgColorHex?: string;
  bgOpacity?: number;
  bgEnabled?: boolean;
  karaoke?: boolean;
  karaokeMode?: 'k' | 'kf' | 'ko';
  karaokeOffsetMs?: number;
  karaokeScale?: number;
  language?: 'en' | 'es' | 'pt' | 'de' | 'hi' | 'zh';
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

const STYLE_TEMPLATES: Record<
  | 'instagram'
  | 'clean'
  | 'instagram_plus'
  | 'clean_plus'
  | 'upper'
  | 'caption_bar'
  | 'outline_color',
  StylePreset
> = {
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
  instagram_plus: {
    name: 'Instagram Plus',
    header: `[Script Info]
ScriptType: v4.00+
Collisions: Normal
PlayResX: 1080
PlayResY: 1920
Timer: 100.0000

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,72,&H00FFFFFF,&H000000FF,&HCC000000,&H99000000,-1,0,0,0,100,100,0,0,3,5,0,2,80,80,140,0

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`,
    bodyTemplate: 'Dialogue: 0,{start},{end},Default,,0,0,0,,{text}',
  },
  clean_plus: {
    name: 'Clean Plus',
    header: `[Script Info]
ScriptType: v4.00+
Collisions: Normal
PlayResX: 1080
PlayResY: 1920
Timer: 100.0000

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,64,&H00FFFFFF,&H000000FF,&HBF000000,&H40000000,0,0,0,0,100,100,0,0,3,4,0,2,80,80,140,0

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`,
    bodyTemplate: 'Dialogue: 0,{start},{end},Default,,0,0,0,,{text}',
  },
  upper: {
    name: 'Upper Bar',
    header: `[Script Info]
ScriptType: v4.00+
Collisions: Normal
PlayResX: 1080
PlayResY: 1920
Timer: 100.0000

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,64,&H00FFFFFF,&H000000FF,&H66000000,&H66000000,-1,0,0,0,100,100,0,0,3,5,0,8,80,80,140,0

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`,
    bodyTemplate: 'Dialogue: 0,{start},{end},Default,,0,0,0,,{text}',
  },
  caption_bar: {
    name: 'Caption Bar',
    header: `[Script Info]
ScriptType: v4.00+
Collisions: Normal
PlayResX: 1080
PlayResY: 1920
Timer: 100.0000

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,68,&H00FFFFFF,&H000000FF,&H99000000,&H99000000,-1,0,0,0,100,100,0,0,3,6,0,2,60,60,160,0

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`,
    bodyTemplate: 'Dialogue: 0,{start},{end},Default,,0,0,0,,{text}',
  },
  outline_color: {
    name: 'Outline Color (Large Font)',
    header: `[Script Info]
ScriptType: v4.00+
Collisions: Normal
PlayResX: 1080
PlayResY: 1920
Timer: 100.0000

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
; Contorno de color con fuente grande
Style: Default,DejaVu Sans,80,&H00FFFFFF,&H000000FF,&H0000FF00,&H00000000,-1,0,0,0,100,100,0,0,1,6,0,2,80,80,140,0

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
  private readonly captionFontsDir: string | null;
  private readonly defaultKaraokeMode: 'k' | 'kf' | 'ko' = 'kf';

  constructor(
    private readonly configService: ConfigService<AppConfig>,
    private readonly jobsService: JobsService,
    private readonly subtitleTranscriber: SubtitleTranscriberService,
  ) {
    this.tempBasePath = this.configService.getOrThrow('paths.temp', {
      infer: true,
    });
    this.outputBasePath = this.configService.getOrThrow('paths.outputs', {
      infer: true,
    });
    const style = this.configService.get('captioning.defaultStyle', {
      infer: true,
    });
    this.defaultStyle = style === 'clean' ? 'clean' : 'instagram';
    const fontsDir =
      this.configService.get('captioning.fontsDir', { infer: true })?.trim() ??
      '';
    this.captionFontsDir = fontsDir || null;
  }

  async captionizeVideo(options: CaptionizeOptions): Promise<CaptionizeResult> {
    await this.ensureDirectories();

    const {
      fileBuffer,
      originalName,
      mimeType,
      authContext,
      style,
      backendOverride,
    } = options;
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

      const transcription = await this.subtitleTranscriber.transcribe(
        audioPath,
        {
          backend: backendOverride,
          approximateDurationSeconds: durationSeconds,
          language: options.language ?? 'auto',
        },
      );

      const segments = transcription.segments.length
        ? transcription.segments
        : [
            {
              start: 0,
              end: Math.max(durationSeconds, 1),
              text: 'Transcripcion no disponible',
            },
          ];

      const resolvedStyle = this.resolveStyle(style);
      const assContent = this.buildAssContent(segments, resolvedStyle, {
        fontSize: options.fontSizeOverride,
        outlineColorHex: options.outlineColorHex,
        textColorHex: options.textColorHex,
        position: options.position,
        bgColorHex: options.bgColorHex,
        bgOpacity: options.bgOpacity,
        bgEnabled: options.bgEnabled ?? false,
      }, { karaoke: options.karaoke === true, words: transcription.words, mode: options.karaokeMode ?? this.defaultKaraokeMode, offsetMs: options.karaokeOffsetMs ?? 0, scale: options.karaokeScale ?? 1 });
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

  private resolveStyle(
    style?:
      | 'instagram'
      | 'clean'
      | 'instagram_plus'
      | 'clean_plus'
      | 'upper'
      | 'caption_bar'
      | 'outline_color',
  ): StylePreset {
    if (style && (STYLE_TEMPLATES as any)[style]) {
      return STYLE_TEMPLATES[style];
    }
    return STYLE_TEMPLATES[this.defaultStyle];
  }

  private async extractAudioToWav(
    inputPath: string,
    audioPath: string,
  ): Promise<void> {
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

  private buildAssContent(
    segments: { start: number; end: number; text: string }[],
    style: StylePreset,
    overrides?: {
      fontSize?: number;
      outlineColorHex?: string;
      textColorHex?: string;
      position?: 'top' | 'bottom';
      bgColorHex?: string;
      bgOpacity?: number;
      bgEnabled?: boolean;
    },
    extras?: { karaoke?: boolean; words?: { word: string; start: number; end: number }[]; mode?: 'k' | 'kf' | 'ko'; offsetMs?: number; scale?: number },
  ): string {
    const header = overrides
      ? this.applyStyleOverrides(style.header, overrides)
      : style.header;
    const body = segments
      .map((segment) => {
        const start = this.formatAssTimestamp(segment.start);
        const end = this.formatAssTimestamp(segment.end);

        if (extras?.karaoke && extras.words && extras.words.length > 0) {
          const text = this.buildKaraokeTextForSegment(segment, extras.words, extras.mode ?? 'kf', extras.offsetMs ?? 0, extras.scale ?? 1);
          return style.bodyTemplate
            .replace('{start}', start)
            .replace('{end}', end)
            .replace('{text}', text);
        } else {
          const text = this.escapeAssText(segment.text);
          return style.bodyTemplate
            .replace('{start}', start)
            .replace('{end}', end)
            .replace('{text}', text);
        }
      })
      .join('\n');

    return `${header}${body}\n`;
  }

  private buildKaraokeTextForSegment(
    segment: { start: number; end: number; text: string },
    words: { word: string; start: number; end: number }[],
    mode: 'k' | 'kf' | 'ko' = 'kf',
    offsetMs = 0,
    scale = 1,
  ): string {
    const EPS = 0.03; // tolerancia 30 ms
    const offsetSec = (offsetMs || 0) / 1000;
    const segStart = segment.start;
    const segEnd = segment.end;
    // Seleccionar palabras que solapan con el segmento (no solo contenidas)
    const inSeg = words
      .map((w) => ({
        word: w.word,
        start: w.start + offsetSec,
        end: w.end + offsetSec,
      }))
      .filter((w) => w.end >= segStart - EPS && w.start <= segEnd + EPS);
    if (inSeg.length === 0) {
      return this.escapeAssText(segment.text);
    }
    const targetCs = Math.max(1, Math.round((segEnd - segStart) * 100));
    const baseDurations = inSeg.map((w) => Math.max(1, Math.round((w.end - w.start) * 100 * (scale || 1))));
    let sumCs = baseDurations.reduce((a, b) => a + b, 0);
    // Ajustar suma al target distribuyendo el error
    const parts: string[] = [];
    if (sumCs !== targetCs && inSeg.length > 0) {
      const diff = targetCs - sumCs;
      // Ajusta en el último token para evitar números negativos
      baseDurations[baseDurations.length - 1] = Math.max(1, baseDurations[baseDurations.length - 1] + diff);
      sumCs = baseDurations.reduce((a, b) => a + b, 0);
    }

    for (let i = 0; i < inSeg.length; i++) {
      const dur = baseDurations[i];
      const tag = `{\\${mode}${dur}}`;
      const safe = this.escapeAssText(inSeg[i].word);
      const sep = i < inSeg.length - 1 ? ' ' : '';
      parts.push(`${tag}${safe}${sep}`);
    }
    return parts.join('');
  }

  private applyStyleOverrides(
    header: string,
    overrides: {
      fontSize?: number;
      outlineColorHex?: string;
      textColorHex?: string;
      position?: 'top' | 'bottom';
      bgColorHex?: string;
      bgOpacity?: number;
      bgEnabled?: boolean;
    },
  ): string {
    const lines = header.split('\n');
    const styleIndex = lines.findIndex((l) => l.trim().startsWith('Style:'));
    if (styleIndex === -1) return header;
    const styleLine = lines[styleIndex];
    const prefix = 'Style: ';
    const rest = styleLine.slice(styleLine.indexOf(prefix) + prefix.length);
    const parts = rest.split(',');
    // Indices per Format order
    // 0 Name, 1 Fontname, 2 Fontsize, 3 PrimaryColour, 4 SecondaryColour, 5 OutlineColour,
    // 6 BackColour, 7 Bold, 8 Italic, 9 Underline, 10 StrikeOut, 11 ScaleX, 12 ScaleY,
    // 13 Spacing, 14 Angle, 15 BorderStyle, 16 Outline, 17 Shadow, 18 Alignment,
    // 19 MarginL, 20 MarginR, 21 MarginV, 22 Encoding
    if (overrides.fontSize !== undefined) {
      parts[2] = String(overrides.fontSize);
    }
    if (overrides.outlineColorHex) {
      parts[5] = this.toAssColorFromHex(overrides.outlineColorHex);
    }
    if (overrides.textColorHex) {
      parts[3] = this.toAssColorFromHex(overrides.textColorHex);
    }
    if (overrides.bgEnabled === false) {
      // Desactivar fondo (solo contorno + sombra)
      parts[15] = '1'; // BorderStyle = 1
    } else if (overrides.bgColorHex) {
      const alpha = overrides.bgOpacity !== undefined ? overrides.bgOpacity : 0.6;
      parts[15] = '3'; // BorderStyle caja para que BackColour aplique como fondo
      parts[6] = this.toAssColorWithAlpha(overrides.bgColorHex, alpha);
    }
    if (overrides.position) {
      // top -> Alignment 8, bottom -> Alignment 2
      parts[18] = overrides.position === 'top' ? '8' : '2';
      // keep MarginV as is; you could tweak parts[21] if needed
    }
    lines[styleIndex] = `${prefix}${parts.join(',')}`;
    return lines.join('\n');
  }

  private toAssColorFromHex(hex: string): string {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
    if (!m) return '&H00FFFFFF';
    const rr = m[1].slice(0, 2);
    const gg = m[1].slice(2, 4);
    const bb = m[1].slice(4, 6);
    // ASS usa &HAABBGGRR (A=00 opaco)
    return `&H00${bb.toUpperCase()}${gg.toUpperCase()}${rr.toUpperCase()}`;
  }

  private toAssColorWithAlpha(hex: string, opacity: number): string {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
    if (!m) return '&H00FFFFFF';
    const rr = m[1].slice(0, 2).toUpperCase();
    const gg = m[1].slice(2, 4).toUpperCase();
    const bb = m[1].slice(4, 6).toUpperCase();
    const a = Math.max(0, Math.min(1, opacity));
    const aa = Math.round((1 - a) * 255)
      .toString(16)
      .toUpperCase()
      .padStart(2, '0');
    return `&H${aa}${bb}${gg}${rr}`;
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

  private async burnSubtitles(options: {
    inputPath: string;
    assPath: string;
    outputPath: string;
  }): Promise<void> {
    const filter = this.buildAssFilter(options.assPath);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(options.inputPath)
        .outputOptions([
          '-preset', 'veryfast',
          '-crf', '20',
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          '-c:a', 'copy',
          '-vf', filter,
        ])
        .on('error', (error) => reject(error))
        .on('end', () => resolve())
        .save(options.outputPath);
    });
  }

  private buildAssFilter(assPath: string): string {
    const escapedPath = this.escapePathForFilter(assPath);
    if (this.captionFontsDir) {
      const escapedFonts = this.escapePathForFilter(this.captionFontsDir);
      return `ass=${escapedPath}:fontsdir=${escapedFonts}`;
    }
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
        this.logger.warn(
          `Failed to remove file ${filePath}: ${(error as Error).message}`,
        );
      }
    }
  }

  private async safeRemoveDirectory(dirPath: string): Promise<void> {
    try {
      await fs.rmdir(dirPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(
          `Failed to remove temp directory ${dirPath}: ${(error as Error).message}`,
        );
      }
    }
  }
}
