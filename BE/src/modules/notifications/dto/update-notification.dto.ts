import { PartialType } from '@nestjs/mapped-types';
import { CreateNotificationDto } from './create-notification.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { NotificationStatus } from '../schemas/notification.schemas';

export class UpdateNotificationDto extends PartialType(CreateNotificationDto) {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  readAt?: string;
}
