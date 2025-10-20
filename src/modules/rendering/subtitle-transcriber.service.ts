import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'fs';
import { AppConfig } from '../../config/configuration';

export interface SubtitleSegment {
  start: number;
  end: number;
  text: string;
}

export interface WordSegment {
  word: string;
  start: number;
  end: number;
}

type SupportedBackend = 'vosk' | 'whisper' | 'mock';
type SupportedLanguage = 'en' | 'es' | 'pt' | 'de' | 'hi' | 'zh';

@Injectable()
export class SubtitleTranscriberService implements OnModuleDestroy {
  private readonly logger = new Logger(SubtitleTranscriberService.name);
  private readonly defaultBackend: SupportedBackend;
  private readonly whisperModel: string;
  private readonly voskModelPath: string;
  private readonly voskModelPaths: Partial<Record<SupportedLanguage, string>>;
  private voskModel: any | null = null;

  constructor(private readonly configService: ConfigService<AppConfig>) {
    const captioningConfig = this.configService.get('captioning', { infer: true });
    this.defaultBackend = captioningConfig?.backend ?? 'mock';
    this.whisperModel = captioningConfig?.whisperModel ?? 'small';
    this.voskModelPath = captioningConfig?.voskModelPath ?? '';
    this.voskModelPaths = (captioningConfig?.voskModelPaths ?? {}) as Partial<
      Record<SupportedLanguage, string>
    >;
  }

  async transcribe(
    audioPath: string,
    options?: {
      backend?: SupportedBackend;
      approximateDurationSeconds?: number;
      language: SupportedLanguage;
    },
  ): Promise<{
    segments: SubtitleSegment[];
    backend: SupportedBackend;
    words?: WordSegment[];
  }> {
    const backend = options?.backend ?? this.defaultBackend;

    if (backend === 'vosk') {
      const lang = options?.language as SupportedLanguage;
      const modelPath = this.resolveVoskModelPath(lang);
      const result = await this.transcribeWithVosk(
        audioPath,
        modelPath,
        options?.approximateDurationSeconds,
      );
      if (result.segments.length > 0) {
        return { segments: result.segments, backend, words: result.words };
      }
      this.logger.warn(
        'Vosk transcription returned no segments, falling back to mock captions',
      );
      return {
        segments: this.buildMockSegments(options?.approximateDurationSeconds),
        backend: 'mock',
        words: result.words,
      };
    }

    if (backend === 'whisper') {
      this.logger.warn(
        `Whisper backend "${this.whisperModel}" not implemented in this build, using mock captions instead`,
      );
    }

    return {
      segments: this.buildMockSegments(options?.approximateDurationSeconds),
      backend: 'mock',
    };
  }

  private async transcribeWithVosk(
    audioPath: string,
    modelPath: string,
    approximateDurationSeconds?: number,
  ): Promise<{ segments: SubtitleSegment[]; words: WordSegment[] }> {
    if (!modelPath) {
      this.logger.warn('Vosk model path not configured for requested language');
      return { segments: [], words: [] };
    }

    if (!existsSync(modelPath)) {
      this.logger.error(`Vosk model path "${modelPath}" does not exist`);
      return { segments: [], words: [] };
    }

    // Prefer Python Vosk fallback to avoid Node ffi-napi build issues
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { spawn } = require('child_process');
      const scriptPath = '/app/scripts/asr_vosk.py';
      const args = ['--model-dir', modelPath, '--audio', audioPath];
      const proc = spawn('python3', [scriptPath, ...args], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => (stdout += d.toString('utf8')));
      proc.stderr.on('data', (d: Buffer) => (stderr += d.toString('utf8')));

      const exitCode: number = await new Promise((resolve) =>
        proc.on('close', resolve),
      );

      if (exitCode !== 0) {
        this.logger.error(
          `Python vosk exited with code ${exitCode}: ${stderr || stdout}`,
        );
        return { segments: [], words: [] };
      }

      const parsed = JSON.parse(stdout);
      const segments: SubtitleSegment[] = Array.isArray(parsed?.segments)
        ? parsed.segments
        : [];
      const wordsRaw: any[] = Array.isArray(parsed?.words) ? parsed.words : [];
      const words: WordSegment[] = wordsRaw.map((w) => this.mapWordItem(w));
      if (!segments.length && approximateDurationSeconds) {
        return {
          segments: this.buildMockSegments(approximateDurationSeconds),
          words,
        };
      }
      return { segments, words };
    } catch (error) {
      this.logger.error('Python vosk pipeline failed', error as Error);
      return { segments: [], words: [] };
    }
  }

  private resolveVoskModelPath(lang: SupportedLanguage): string {
    const p = this.voskModelPaths?.[lang];
    return (p && p.trim()) || this.voskModelPath || '';
  }

  private mapWordItem(item: any): WordSegment {
    return {
      word: String(item.word ?? '').trim(),
      start: typeof item.start === 'number' ? item.start : 0,
      end: typeof item.end === 'number' ? item.end : 0,
    };
  }

  private groupWordsIntoSegments(
    words: WordSegment[],
    approximateDurationSeconds?: number,
  ): SubtitleSegment[] {
    const segments: SubtitleSegment[] = [];
    const MAX_WORDS = 14;
    const MAX_DURATION = 4.5;

    let buffer: WordSegment[] = [];

    const flushBuffer = () => {
      if (buffer.length === 0) {
        return;
      }
      const start = buffer[0].start;
      const end = buffer[buffer.length - 1].end;
      const text = buffer.map((word) => word.word).join(' ').trim();
      if (text) {
        segments.push({
          start,
          end: Math.max(end, start + 1.2),
          text,
        });
      }
      buffer = [];
    };

    for (const word of words) {
      if (!word.word) {
        continue;
      }

      buffer.push(word);
      const currentDuration = buffer[buffer.length - 1].end - buffer[0].start;

      if (buffer.length >= MAX_WORDS || currentDuration >= MAX_DURATION) {
        flushBuffer();
      }
    }

    flushBuffer();

    if (segments.length === 0 && approximateDurationSeconds) {
      return this.buildMockSegments(approximateDurationSeconds);
    }

    return segments;
  }

  private buildMockSegments(
    approximateDurationSeconds?: number,
  ): SubtitleSegment[] {
    const duration = Math.max(approximateDurationSeconds ?? 5, 2);
    const midpoint = Math.min(duration, 6);
    return [
      {
        start: 0,
        end: Math.min(midpoint, duration),
        text: 'Transcripcion no disponible',
      },
    ];
  }

  onModuleDestroy(): void {
    if (this.voskModel) {
      this.logger.log('Releasing Vosk model from memory');
      try {
        this.voskModel.free();
      } catch (error) {
        this.logger.warn(
          `Failed to free Vosk model: ${(error as Error).message}`,
        );
      } finally {
        this.voskModel = null;
      }
    }
  }
}
