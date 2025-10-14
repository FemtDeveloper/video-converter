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
});
