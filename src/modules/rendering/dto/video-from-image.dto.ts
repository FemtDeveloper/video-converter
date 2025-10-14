import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class VideoFromImageDto {
  @IsOptional()
  @IsIn(['mp4'])
  format?: 'mp4';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  @Transform(({ value }) => (value !== undefined ? Number(value) : value))
  durationSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  @Transform(({ value }) => (value !== undefined ? Number(value) : value))
  fps?: number;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  backgroundColor?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === undefined) {
      return value;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    return value === 'true';
  })
  loop?: boolean;

  @IsOptional()
  @IsString()
  filename?: string;
}
