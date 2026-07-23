import { Type } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class AssignShipperDto {
  @IsMongoId()
  shipperId: string;
}

export class RejectAssignmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

export enum ShipperJobsView {
  ACTIVE = 'active',
  ASSIGNED = 'assigned',
  FAILED = 'failed',
  HISTORY = 'history',
  ALL = 'all',
}

export class DeliveryLocationDto {
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @Type(() => Number)
  @IsLongitude()
  lng: number;
}

export class CompleteDeliveryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  recipientName: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  @Matches(
    /^(?:https?:\/\/[^\s]+)?\/images\/proof\/[a-f0-9-]+\.(?:jpg|png|heic|heif)$/i,
    { message: 'proofOfDeliveryUrl không hợp lệ' },
  )
  @MaxLength(500)
  proofOfDeliveryUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;
}

export class FailDeliveryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;
}
