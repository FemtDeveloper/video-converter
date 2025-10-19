import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min, MaxLength } from 'class-validator';

export class VideoFromImageDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @IsIn(['instagram', 'clean', 'instagram_plus', 'clean_plus', 'upper', 'caption_bar', 'outline_color'], {
    message: 'style must be one of: instagram, clean, instagram_plus, clean_plus, upper, caption_bar, outline_color',
  })
  style?: 'instagram' | 'clean' | 'instagram_plus' | 'clean_plus' | 'upper' | 'caption_bar' | 'outline_color';
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

  // Nuevo: si true, la imagen se redimensiona para "rellenar" el cuadro 1080x1920 (cover),
  // recortando los excedentes. Si false/omitido, se usa contain + padding.
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === undefined) return value;
    if (typeof value === 'boolean') return value;
    return value === 'true' || value === '1';
  })
  fillFrame?: boolean;

  @IsOptional()
  @IsString()
  filename?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  captionText?: string;

  // Estándar de estilo (usar estos nuevos campos)
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  textColor?: string;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  bgColor?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const n = Number(value);
    if (Number.isNaN(n)) return undefined;
    return Math.max(0, Math.min(1, n));
  })
  bgOpacity?: number;

  @IsOptional()
  @IsInt()
  @Min(16)
  @Max(120)
  @Transform(({ value }) => (value !== undefined ? Number(value) : value))
  captionFontSize?: number; // legado; usar fontSize

  @IsOptional()
  @IsInt()
  @Min(16)
  @Max(120)
  @Transform(({ value }) => (value !== undefined ? Number(value) : value))
  fontSize?: number;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  outlineColor?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  @Transform(({ value }) => (value !== undefined ? Number(value) : value))
  outlineWidth?: number;

  @IsOptional()
  @IsIn(['top', 'bottom'])
  position?: 'top' | 'bottom';

  // Habilitar/deshabilitar fondo (placa). Por defecto true
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === undefined) return undefined;
    if (typeof value === 'boolean') return value;
    return value === 'true' || value === '1';
  })
  bgEnabled?: boolean;
}
