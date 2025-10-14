import { Module } from "@nestjs/common";
import { ApiKeyService } from "./api-key.service";
import { ApiKeyGuard } from "./api-key.guard";
import { RateLimitModule } from "../../common/rate-limit/rate-limit.module";

@Module({
  imports: [RateLimitModule],
  providers: [ApiKeyService, ApiKeyGuard],
  exports: [ApiKeyGuard, ApiKeyService],
})
export class AuthModule {}
