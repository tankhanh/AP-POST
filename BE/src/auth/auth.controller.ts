import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { Public, ResponseMessage, Users } from 'src/health/decorator/customize';
import {
  RegisterUserDto,
  UserLoginDto,
} from 'src/modules/users/dto/create-user.dto';
import { CodeAuthDto } from 'src/modules/users/dto/code-auth.dto';
import {
  ChangePasswordDto,
  ResetPasswordDto,
  VerifyResetCodeDto,
} from 'src/modules/users/dto/change-password.dto';
import { IUser } from 'src/types/user.interface';
import { AuthService } from './auth.service';
import { EmailDto } from './dto/email.dto';
import { LocalAuthGuard } from './guards/local.auth.guard';
import { JwtAuthGuard } from './guards/jwt.auth.guard';

@ApiTags('auth')
@UseGuards(JwtAuthGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @UseGuards(LocalAuthGuard)
  @ApiBody({ type: UserLoginDto })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @ResponseMessage('User Login')
  handleLogin(@Req() request, @Res({ passthrough: true }) response: Response) {
    return this.authService.login(request.user, response);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @ResponseMessage('Register a new user')
  handleRegister(@Body() registerUserDto: RegisterUserDto) {
    return this.authService.register(registerUserDto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('check-code')
  @ResponseMessage('Verify registration code')
  checkCode(@Body() data: CodeAuthDto) {
    return this.authService.checkCode(data);
  }

  @Get('account')
  @ResponseMessage('Get user information')
  handleGetAccount(@Users() user: IUser) {
    return { user };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('refresh')
  @ResponseMessage('Refresh access token')
  handleRefreshToken(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.processNewToken(
      request.cookies?.refresh_token,
      response,
    );
  }

  @Post('logout')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ResponseMessage('Logout user')
  handleLogout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.logout(response, request.cookies?.refresh_token);
  }

  @Public()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('verify-reset')
  @ResponseMessage('Verify password reset code')
  verifyReset(@Body() data: VerifyResetCodeDto) {
    return this.authService.verifyResetCode(data);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('retry-active')
  @ResponseMessage('Resend registration code')
  retryActive(@Body() data: EmailDto) {
    return this.authService.retryActive(data.email);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('retry-password')
  @ResponseMessage('Request password reset code')
  retryPassword(@Body() data: EmailDto) {
    return this.authService.retryPassword(data.email);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('change-password')
  @ResponseMessage('Change password')
  changePassword(@Body() data: ChangePasswordDto) {
    return this.authService.changePassword(data);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @ResponseMessage('Reset password')
  resetPassword(@Body() data: ResetPasswordDto) {
    return this.authService.resetPassword(data);
  }
}
