import { Injectable, Logger } from '@nestjs/common';
import { Job, JobStatus, JobType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

interface CreateJobOptions {
  organizationId: string;
  type: JobType;
  requestPayload: Record<string, unknown>;
}

interface CompleteJobOptions {
  jobId: string;
  durationSeconds: number;
  resultPath: string;
  outputMimeType: string;
  outputSizeBytes: number;
}

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createJob(options: CreateJobOptions): Promise<Job> {
    const job = await this.prisma.job.create({
      data: {
        organizationId: options.organizationId,
        type: options.type,
        status: JobStatus.PROCESSING,
        requestPayload: options.requestPayload as Prisma.InputJsonValue,
      },
    });

    this.logger.log(`Created job ${job.id} for organization ${options.organizationId}`);
    return job;
  }

  async markCompleted(options: CompleteJobOptions): Promise<void> {
    await this.prisma.job.update({
      where: { id: options.jobId },
      data: {
        status: JobStatus.COMPLETED,
        durationSeconds: Math.round(options.durationSeconds),
        resultPath: options.resultPath,
        outputMimeType: options.outputMimeType,
        outputSizeBytes: options.outputSizeBytes,
        completedAt: new Date(),
      },
    });
  }

  async markFailed(jobId: string, error: Error): Promise<void> {
    await this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.FAILED,
        errorMessage: error.message,
      },
    });
    this.logger.error(`Job ${jobId} failed`, error.stack);
  }
}
