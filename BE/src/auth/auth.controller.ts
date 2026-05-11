import {
  Controller,
  Post,
  UseGuards,
  Req,
  Body,
  Res,
  Get,
} from '@nestjs/common';

import { AuthService } from './auth.service';

import { Request, Response } from 'express';

import { Public, ResponseMessage, Users } from 'src/health/decorator/customize';

import { IUser } from 'src/types/user.interface';

import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { ApiBody, ApiTags } from '@nestjs/swagger';

import { LocalAuthGuard } from './guards/local.auth.guard';

import { ConfigService } from '@nestjs/config';

import { UsersService } from 'src/modules/users/users.service';

import {
  RegisterUserDto,
  UserLoginDto,
} from 'src/modules/users/dto/create-user.dto';

import { CodeAuthDto } from 'src/modules/users/dto/code-auth.dto';

import { ChangePasswordDto } from 'src/modules/users/dto/change-password.dto';

import { MailService } from 'src/modules/mail/mail.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,

    private readonly configService: ConfigService,

    private readonly mailService: MailService,

    private readonly usersService: UsersService,
  ) {}

  // ================= LOGIN =================

  @Public()
  @UseGuards(LocalAuthGuard)
  @UseGuards(ThrottlerGuard)
  @ApiBody({ type: UserLoginDto })
  @Throttle(5, 60)
  @Post('/login')
  @ResponseMessage('User Login')
  handleLogin(@Req() req, @Res({ passthrough: true }) response: Response) {
    return this.authService.login(req.user, response);
  }

  // ================= REGISTER =================

  @Public()
  @ResponseMessage('Register a new user')
  @Post('/register')
  handleRegister(@Body() registerUserDto: RegisterUserDto) {
    return this.authService.register(registerUserDto);
  }

  // ================= VERIFY REGISTER CODE =================

  @Public()
  @ResponseMessage('verify register code')
  @Post('check-code')
  checkCode(@Body() registerUserDto: CodeAuthDto) {
    return this.authService.checkCode(registerUserDto);
  }

  // ================= ACCOUNT =================

  @ResponseMessage('Get user information')
  @Get('/account')
  async handleGetAccount(@Users() user: IUser) {
    return { user };
  }

  // ================= REFRESH TOKEN =================

  @Public()
  @ResponseMessage('Get User by refresh token')
  @Get('/refresh')
  handleRefreshToken(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies['refresh_token'];

    return this.authService.processNewToken(refreshToken, response);
  }

  // ================= LOGOUT =================

  @ResponseMessage('Logout User')
  @Post('/logout')
  handleLogout(
    @Res({ passthrough: true }) response: Response,
    @Users() user: IUser,
  ) {
    return this.authService.logout(response, user);
  }

  // ================= TEST MAIL =================

  @Get('mail')
  @Public()
  async testMail() {
    const result = await this.mailService.sendTemplateMail(
      'dinhtankhanh14@gmail.com',
      'Testing Brevo Mail Service',
      'register',
      {
        name: 'Khanh',
        activationCode: '123456',
      },
    );

    return {
      success: result,
    };
  }

  // ================= VERIFY RESET PASSWORD =================

  @Public()
  @ResponseMessage('verify reset password code')
  @Post('verify-reset')
  verifyReset(@Body() data: CodeAuthDto) {
    return this.authService.checkCode(data);
  }

  // ================= RETRY ACTIVE =================

  @Public()
  @ResponseMessage('re-verify register code')
  @Post('retry-active')
  retryActive(@Body('email') email: string) {
    return this.authService.retryActive(email);
  }

  // ================= RETRY PASSWORD =================

  @Public()
  @ResponseMessage('re-password register code')
  @Post('retry-password')
  retryPassword(@Body('email') email: string) {
    return this.authService.retryPassword(email);
  }

  // ================= CHANGE PASSWORD =================

  @Public()
  @ResponseMessage('change-password')
  @Post('change-password')
  changePassword(@Body() data: ChangePasswordDto) {
    return this.authService.changePassword(data);
  }

  // ================= RESET PASSWORD =================

  @Public()
  @Post('reset-password')
  async resetPassword(@Body() body: { _id: string; newPassword: string }) {
    return this.authService.resetPassword(body);
  }
}
