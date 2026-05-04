import { IsString, IsEnum, IsOptional, IsBoolean, IsNumber } from 'class-validator';
import { KeywordMatchType, AutoReplyType } from '../entities/auto-reply.entity';

export class CreateAutoReplyDto {
  @IsString()
  keyword: string;

  @IsEnum(KeywordMatchType)
  @IsOptional()
  matchType?: KeywordMatchType = KeywordMatchType.PARTIAL;

  @IsEnum(AutoReplyType)
  @IsOptional()
  replyType?: AutoReplyType = AutoReplyType.CUSTOM;

  @IsString()
  @IsOptional()
  customReply?: string;

  @IsNumber()
  @IsOptional()
  templateId?: number;

  @IsBoolean()
  @IsOptional()
  caseSensitive?: boolean = false;

  @IsNumber()
  @IsOptional()
  conversationId?: number;
}

export class UpdateAutoReplyDto {
  @IsString()
  @IsOptional()
  keyword?: string;

  @IsEnum(KeywordMatchType)
  @IsOptional()
  matchType?: KeywordMatchType;

  @IsEnum(AutoReplyType)
  @IsOptional()
  replyType?: AutoReplyType;

  @IsString()
  @IsOptional()
  customReply?: string;

  @IsNumber()
  @IsOptional()
  templateId?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  caseSensitive?: boolean;
}
