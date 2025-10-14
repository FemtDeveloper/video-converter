import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface ApiKeyValidationResult {
  apiKeyId: string;
  organizationId: string;
  organizationName: string;
}

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async validate(apiKey: string): Promise<ApiKeyValidationResult | null> {
    if (!apiKey || apiKey.length < 16) {
      return null;
    }

    const prefix = apiKey.slice(0, 8);
    const candidates = await this.prisma.apiKey.findMany({
      where: {
        keyPrefix: prefix,
        isActive: true,
      },
      include: {
        organization: true,
      },
    });

    for (const candidate of candidates) {
      const matches = await bcrypt.compare(apiKey, candidate.keyHash);
      if (matches) {
        await this.prisma.apiKey.update({
          where: { id: candidate.id },
          data: { lastUsedAt: new Date() },
        });

        return {
          apiKeyId: candidate.id,
          organizationId: candidate.organizationId,
          organizationName: candidate.organization.name,
        };
      }
    }

    this.logger.warn(`API key validation failed for prefix ${prefix}`);
    return null;
  }
}
