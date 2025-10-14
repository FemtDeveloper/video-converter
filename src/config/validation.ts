import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  APP_PORT: Joi.number().integer().min(1024).max(65535).default(4100),
  APP_NAME: Joi.string().default('video-converter'),
  API_KEY_HEADER: Joi.string().default('x-api-key'),
  MAX_IMAGE_UPLOAD_MB: Joi.number().positive().max(100).default(5),
  MAX_VIDEO_DURATION_SECONDS: Joi.number().positive().max(600).default(70),
  RATE_LIMIT_WINDOW_SECONDS: Joi.number().positive().default(3600),
  RATE_LIMIT_MAX_REQUESTS: Joi.number().positive().default(60),
  RATE_LIMIT_BURST_CAP: Joi.number().positive().default(5),
  TEMP_STORAGE_PATH: Joi.string().default('/app/tmp/jobs'),
  OUTPUT_STORAGE_PATH: Joi.string().default('/app/data/outputs'),
  DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(),
  REDIS_URL: Joi.string().uri({ scheme: ['redis'] }).required(),
  INITIAL_API_KEY: Joi.string().min(16).required(),
  LOG_LEVEL: Joi.string().valid('debug', 'info', 'warn', 'error').default('info'),
});
