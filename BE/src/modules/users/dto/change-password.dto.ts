import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'a1b2c3', description: 'Mã code xác thực' })
  @IsNotEmpty({ message: 'code không được để trống' })
  @IsString()
  code: string;

  @ApiProperty({ example: 'NewPass@123', description: 'Mật khẩu mới' })
  @IsNotEmpty({ message: 'password không được để trống' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'NewPass@123', description: 'Xác nhận mật khẩu' })
  @IsNotEmpty({ message: 'confirmPassword không được để trống' })
  @IsString()
  @MinLength(8)
  confirmPassword: string;

  @ApiProperty({ example: 'user@gmail.com', description: 'Email người dùng' })
  @IsNotEmpty({ message: 'email không được để trống' })
  @IsEmail({}, { message: 'email không hợp lệ' })
  email: string;
}

export class VerifyResetCodeDto {
  @ApiProperty({ example: 'user@gmail.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'A1B2C3' })
  @IsString()
  @IsNotEmpty()
  code: string;
}

export class ResetPasswordDto extends VerifyResetCodeDto {
  @ApiProperty({ example: 'NewPass@123' })
  @IsString()
  @MinLength(8)
  newPassword: string;

  @ApiProperty({ example: 'NewPass@123' })
  @IsString()
  @MinLength(8)
  confirmPassword: string;
}
