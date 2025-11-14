import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class AddressDto {
  @ApiProperty({ example: '65f2a2bb70f7a1f4fa11111' })
  @IsNotEmpty()
  @IsString()
  provinceId: string;

  @ApiProperty({ example: '65f2a2bb70f7a1f4fa22222' })
  @IsNotEmpty()
  @IsString()
  communeId: string;

  @ApiProperty({ example: '123 Nguyễn Văn Cừ, Q.5' })
  @IsNotEmpty()
  @IsString()
  address: string;
}

export class CreateOrderDto {
  @ApiProperty({ example: 'Nguyễn Văn A' })
  @IsNotEmpty()
  @IsString()
  senderName: string;

  @ApiProperty({ example: 'Trần Thị B' })
  @IsNotEmpty()
  @IsString()
  receiverName: string;

  @ApiProperty({ example: '0987654321' })
  @IsNotEmpty()
  @IsString()
  receiverPhone: string;

  @ApiProperty({ type: AddressDto })
  @ValidateNested()
  @Type(() => AddressDto)
  pickupAddress: AddressDto;

  @ApiProperty({ type: AddressDto })
  @ValidateNested()
  @Type(() => AddressDto)
  deliveryAddress: AddressDto;

  @ApiProperty({ example: 100000 })
  @IsNumber()
  @Min(0)
  totalPrice: number;
}
