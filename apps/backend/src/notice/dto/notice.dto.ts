import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateNoticeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  body!: string;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  /** 즉시 게시하려면 true. false 면 임시저장(publishedAt=null). */
  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}

export class UpdateNoticeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  body?: string;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  /** true=게시(publishedAt=now), false=비공개(publishedAt=null). 미지정 시 유지. */
  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}
