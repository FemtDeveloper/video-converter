import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiKeyGuard } from "../auth/api-key.guard";

@Controller("implementation-plan")
@UseGuards(ApiKeyGuard)
export class ImplementationPlanController {
  @Get()
  getPlan() {
    return {
      phase1: {
        title: "Secure single-image to video MVP",
        goals: [
          "NestJS API protected by API key and Redis-backed rate limiting",
          "Image-to-video conversion via FFmpeg with 9:16 1080x1920 output",
          "Swagger documentation gated by API key with beta implementation plan",
          "Dockerized stack with Postgres + Prisma, Redis, and nginx reverse proxy",
        ],
      },
      phase2: {
        title: "Multi-image, subtitles, and async processing",
        goals: [
          "BullMQ queue for slideshow rendering and Redis worker scalability",
          "Subtitle ingestion (SRT/JSON) with optional burn-in and media transitions",
          "Artifact lifecycle management and signed download endpoints",
          "Operational dashboards, alerts, and job analytics",
        ],
      },
      phase3: {
        title: "Commercialization and self-service onboarding",
        goals: [
          "Organizations, users, and MFA-secured authentication with JWT",
          "Stripe billing integration with plan-based quotas and usage reporting",
          "Customer portal for API key rotation, analytics, and invoices",
          "Advanced security hardening (WAF, audit logs, storage tier upgrades)",
        ],
      },
      limits: {
        maxImageMegabytes: 5,
        maxVideoDurationSeconds: 70,
        rateLimitPerHour: 60,
      },
      lastUpdated: new Date().toISOString(),
    };
  }
}
