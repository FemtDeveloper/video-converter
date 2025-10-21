export type VideoJobName = 'IMAGE_TO_VIDEO' | 'VIDEO_CAPTION';

export interface BaseVideoJobPayload {
  jobId: string;
  organizationId: string;
  type: VideoJobName; // IMAGE_TO_VIDEO | VIDEO_CAPTION
  inputPath: string;
  originalName: string;
  mimeType: string;
}

export interface ImageToVideoJobPayload extends BaseVideoJobPayload {
  type: 'IMAGE_TO_VIDEO';
  dto: Record<string, unknown>;
}

export interface CaptionizeJobPayload extends BaseVideoJobPayload {
  type: 'VIDEO_CAPTION';
  dto: Record<string, unknown>;
}

export type AnyVideoJobPayload = ImageToVideoJobPayload | CaptionizeJobPayload;
