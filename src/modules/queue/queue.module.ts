import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QueueService } from './queue.service';
import { RedisModule } from '../../common/redis/redis.module';

@Module({
  imports: [ConfigModule, RedisModule],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}

