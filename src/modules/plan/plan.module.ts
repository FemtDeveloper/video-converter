import { Module } from '@nestjs/common';
import { ImplementationPlanController } from './implementation-plan.controller';

@Module({
  controllers: [ImplementationPlanController],
})
export class PlanModule {}
