export interface AppConfig {
  app: {
    name: string;
    port: number;
    env: string;
    apiKeyHeader: string;
  };
  limits: {
    maxImageUploadMb: number;
    maxVideoDurationSeconds: number;
    maxVideoUploadMb: number;
  };
  rateLimit: {
    windowSeconds: number;
    maxRequests: number;
    burst: number;
  };
  paths: {
    temp: string;
    outputs: string;
  };
  database: {
    url: string;
  };
  redis: {
    url: string;
  };
  security: {
    logLevel: string;
  };
  captioning: {
    backend: 'vosk' | 'whisper' | 'mock';
    whisperModel: string;
    voskModelPath: string;
    voskModelPaths: Partial<Record<'en' | 'es' | 'pt' | 'de' | 'hi' | 'zh', string>>;
    defaultStyle: string;
    fontFile: string;
    fontsDir: string;
  };
}

export const configuration = (): AppConfig => ({
  app: {
    name: process.env.APP_NAME ?? 'video-converter',
    port: parseInt(process.env.APP_PORT ?? '4100', 10),
    env: process.env.NODE_ENV ?? 'development',
    apiKeyHeader: (process.env.API_KEY_HEADER ?? 'x-api-key').toLowerCase(),
  },
  limits: {
    maxImageUploadMb: parseInt(process.env.MAX_IMAGE_UPLOAD_MB ?? '5', 10),
    maxVideoDurationSeconds: parseInt(process.env.MAX_VIDEO_DURATION_SECONDS ?? '70', 10),
    maxVideoUploadMb: parseInt(process.env.MAX_VIDEO_UPLOAD_MB ?? '200', 10),
  },
  rateLimit: {
    windowSeconds: parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS ?? '3600', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? '60', 10),
    burst: parseInt(process.env.RATE_LIMIT_BURST_CAP ?? '5', 10),
  },
  paths: {
    temp: process.env.TEMP_STORAGE_PATH ?? '/app/tmp/jobs',
    outputs: process.env.OUTPUT_STORAGE_PATH ?? '/app/data/outputs',
  },
  database: {
    url: process.env.DATABASE_URL ?? '',
  },
  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },
  security: {
    logLevel: process.env.LOG_LEVEL ?? 'info',
  },
  captioning: (() => {
    const backendEnv = (process.env.ASR_BACKEND ?? 'mock').toLowerCase();
    const backend: 'vosk' | 'whisper' | 'mock' =
      backendEnv === 'vosk' || backendEnv === 'whisper' ? (backendEnv as 'vosk' | 'whisper') : 'mock';
    const modelMap: Partial<Record<'en' | 'es' | 'pt' | 'de' | 'hi' | 'zh', string>> = {};
    const mEn = process.env.VOSK_MODEL_PATH_EN ?? '';
    const mEs = process.env.VOSK_MODEL_PATH_ES ?? '';
    const mPt = process.env.VOSK_MODEL_PATH_PT ?? '';
    const mDe = process.env.VOSK_MODEL_PATH_DE ?? '';
    const mHi = process.env.VOSK_MODEL_PATH_HI ?? '';
    const mZh = process.env.VOSK_MODEL_PATH_ZH ?? '';
    if (mEn) modelMap.en = mEn;
    if (mEs) modelMap.es = mEs;
    if (mPt) modelMap.pt = mPt;
    if (mDe) modelMap.de = mDe;
    if (mHi) modelMap.hi = mHi;
    if (mZh) modelMap.zh = mZh;
    return {
      backend,
      whisperModel: process.env.WHISPER_MODEL ?? 'small',
      voskModelPath: process.env.VOSK_MODEL_PATH ?? '',
      voskModelPaths: modelMap,
      defaultStyle: process.env.SUBS_STYLE ?? 'instagram',
      fontFile: process.env.CAPTION_FONT_FILE ?? '',
      fontsDir: process.env.CAPTION_FONTS_DIR ?? '',
    };
  })(),
});
