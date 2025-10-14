import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { createHash } from 'crypto';
import { ApiKeyService, ApiKeyValidationResult } from './api-key.service';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { AppConfig } from '../../config/configuration';

export interface AuthenticatedRequest extends Request {
  authContext?: ApiKeyValidationResult;
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService<AppConfig>,
    private readonly apiKeyService: ApiKeyService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<AuthenticatedRequest>();
    const response = httpContext.getResponse<Response>();
    const headerName = this.configService.getOrThrow<string>('app.apiKeyHeader', { infer: true });
    const normalizedHeader = headerName.toLowerCase();

    const headerValue = request.headers[normalizedHeader];
    const apiKeyValue = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    if (!apiKeyValue || typeof apiKeyValue !== 'string') {
      throw new UnauthorizedException('Missing API key header');
    }

    const hashedKey = createHash('sha256').update(apiKeyValue).digest('hex');
    const rateLimitResult = await this.rateLimitService.consume(hashedKey);
    const headers = this.rateLimitService.buildHeaders(rateLimitResult);
    Object.entries(headers).forEach(([key, value]) => response.setHeader(key, value));

    if (!rateLimitResult.allowed) {
      throw new HttpException('API rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }

    const validationResult = await this.apiKeyService.validate(apiKeyValue);
    if (!validationResult) {
      throw new ForbiddenException('Invalid API key');
    }

    request.authContext = validationResult;
    return true;
  }
}
