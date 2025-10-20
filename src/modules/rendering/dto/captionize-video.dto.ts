import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class CaptionizeVideoDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @IsIn(['instagram', 'clean', 'instagram_plus', 'clean_plus', 'upper', 'caption_bar', 'outline_color'], {
    message: 'style must be one of: instagram, clean, instagram_plus, clean_plus, upper, caption_bar, outline_color',
  })
  style?: 'instagram' | 'clean' | 'instagram_plus' | 'clean_plus' | 'upper' | 'caption_bar' | 'outline_color';

  @IsOptional()
  @IsString()
  @MaxLength(16)
  @IsIn(['vosk', 'whisper', 'mock'], { message: 'backend must be one of: vosk, whisper, mock' })
  backend?: 'vosk' | 'whisper' | 'mock';

  // Color del texto (PrimaryColour)
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  textColor?: string;

  // Color del borde (OutlineColour)
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  outlineColor?: string;

  // Nuevo: color hexadecimal para el borde del subtítulo (OutlineColour)
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  outlineColorLegacy?: string;

  // Nuevo: tamaño de fuente
  @IsOptional()
  @IsInt()
  @Min(24)
  @Max(120)
  @Transform(({ value }) => (value !== undefined ? Number(value) : value))
  fontSize?: number;

  // Nuevo: posición del subtítulo
  @IsOptional()
  @IsIn(['top', 'bottom'])
  position?: 'top' | 'bottom';

  // Fondo de la placa (ASS BackColour). No redondea esquinas, es rectangular.
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

  // Habilitar/deshabilitar fondo (placa). Por defecto: true
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined) return undefined;
    if (typeof value === 'boolean') return value;
    return value === 'true' || value === '1';
  })
  bgEnabled?: boolean;

  // Habilita resaltado tipo karaoke (palabra por palabra)
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === undefined) return undefined;
    if (typeof value === 'boolean') return value;
    return value === 'true' || value === '1';
  })
  karaoke?: boolean;

  // Modo de karaoke: 'k' (discreto), 'kf' (barrido/fill), 'ko' (outline)
  @IsOptional()
  @IsString()
  @MaxLength(2)
  @IsIn(['k', 'kf', 'ko'], { message: 'karaokeMode must be one of: k, kf, ko' })
  karaokeMode?: 'k' | 'kf' | 'ko';

  // Ajuste fino de sincronía (ms). Permite adelantar(+)/atrasar(-) el resaltado
  @IsOptional()
  @IsInt()
  @Min(-1000)
  @Max(1000)
  @Transform(({ value }) => (value !== undefined && value !== null && value !== '' ? Number(value) : undefined))
  karaokeOffsetMs?: number;

  // Escala de duración por palabra (0.5–2.0)
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const n = Number(value);
    if (Number.isNaN(n)) return undefined;
    return n;
  })
  @IsIn([0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.75, 2], {
    message: 'karaokeScale must be between 0.5 and 2.0',
  })
  karaokeScale?: number;
}
