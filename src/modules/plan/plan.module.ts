import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ImplementationPlanController } from "./implementation-plan.controller";

@Module({
  imports: [AuthModule],
  controllers: [ImplementationPlanController],
})
export class PlanModule {}
