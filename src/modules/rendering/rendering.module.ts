import { Module } from '@nestjs/common';
import { RenderingService } from './rendering.service';
import { JobsModule } from '../jobs/jobs.module';
import { AuthModule } from '../auth/auth.module';
import { CaptioningService } from './captioning.service';
import { SubtitleTranscriberService } from './subtitle-transcriber.service';

@Module({
  imports: [JobsModule, AuthModule],
  controllers: [],
  providers: [RenderingService, CaptioningService, SubtitleTranscriberService],
  exports: [RenderingService, CaptioningService],
})
export class RenderingModule {}
