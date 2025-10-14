import { Module } from '@nestjs/common';
import { RenderingController } from './rendering.controller';
import { RenderingService } from './rendering.service';
import { JobsModule } from '../jobs/jobs.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [JobsModule, AuthModule],
  controllers: [RenderingController],
  providers: [RenderingService],
  exports: [RenderingService],
})
export class RenderingModule {}
