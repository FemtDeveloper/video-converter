import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';
import { ApiKeyService } from './modules/auth/api-key.service';
import { PrismaService } from './common/prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = new Logger('Bootstrap');
  const configService = app.get(ConfigService<AppConfig>);
  const appConfig = configService.getOrThrow('app', { infer: true });

  app.useLogger(logger);
  app.use(
    helmet({
      crossOriginResourcePolicy: false,
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'script-src': ["'self'"],
          'img-src': ["'self'", 'data:'],
        },
      },
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.enableShutdownHooks();
  const prismaService = app.get(PrismaService);
  await prismaService.enableShutdownHooks(app);

  const apiKeyService = app.get(ApiKeyService);
  const docsPaths = ['/docs', '/docs-json'];
  const normalizedHeader = appConfig.apiKeyHeader.toLowerCase();

  docsPaths.forEach((path) => {
    app.use(path, (req: Request, res: Response, next: NextFunction) => {
      const headerValue = req.headers[normalizedHeader];
      const apiKey = Array.isArray(headerValue) ? headerValue[0] : headerValue;
      if (!apiKey || typeof apiKey !== 'string') {
        res.status(401).send('API key required');
        return;
      }
      apiKeyService
        .validate(apiKey)
        .then((result) => {
          if (!result) {
            res.status(403).send('Invalid API key');
            return;
          }
          next();
        })
        .catch(() => {
          res.status(500).send('Unable to verify API key');
        });
    });
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Video Converter API')
    .setDescription('Convert still images into vertical 1080x1920 videos')
    .setVersion('1.0.0')
    .addApiKey({ type: 'apiKey', in: 'header', name: appConfig.apiKeyHeader }, 'apiKey')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = appConfig.port;
  await app.listen(port, '0.0.0.0');
  logger.log(`Application running on port ${port}`);
}
bootstrap();
