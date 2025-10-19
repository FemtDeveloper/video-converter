import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CaptionizeVideoDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @IsIn(['instagram', 'clean'], { message: 'style must be one of: instagram, clean' })
  style?: 'instagram' | 'clean';

  @IsOptional()
  @IsString()
  @MaxLength(16)
  @IsIn(['vosk', 'whisper', 'mock'], { message: 'backend must be one of: vosk, whisper, mock' })
  backend?: 'vosk' | 'whisper' | 'mock';
}
