import { PartialType } from '@nestjs/mapped-types';
import { CreateOrderDto } from './create-order.dto';
import { IsEmail, IsEnum, IsOptional } from 'class-validator';
import { OrderStatus } from '../schemas/order.schemas';

export class UpdateOrderDto extends PartialType(CreateOrderDto) {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsEmail()
  email?: string;
}
