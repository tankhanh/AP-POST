import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateVnpayPaymentDto {
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  amount?: number;
}