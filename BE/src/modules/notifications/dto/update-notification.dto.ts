import { PartialType } from '@nestjs/mapped-types';
import { CreateNotificationDto } from './create-notification.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateNotificationDto extends PartialType(CreateNotificationDto) {
	@ApiProperty({ required: false })
	@IsOptional()
	@IsString()
	status?: string;

	@ApiProperty({ required: false })
	@IsOptional()
	readAt?: Date;
}
