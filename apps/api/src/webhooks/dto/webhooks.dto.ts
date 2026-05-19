import {
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
} from 'class-validator';

import { WEBHOOK_EVENTS, type WebhookEventName } from '../webhooks.types';

export class CreateWebhookDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  url!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMinSize(1)
  @IsIn(WEBHOOK_EVENTS as unknown as string[], { each: true })
  events!: WebhookEventName[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateWebhookDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  url?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(WEBHOOK_EVENTS as unknown as string[], { each: true })
  events?: WebhookEventName[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
