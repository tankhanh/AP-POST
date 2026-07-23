import { BadRequestException, Injectable } from '@nestjs/common';
import { UsersService } from 'src/modules/users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import ms from 'ms';
import { Response } from 'express';
import { IUser } from 'src/types/user.interface';
import { RegisterUserDto } from 'src/modules/users/dto/create-user.dto';
import { CodeAuthDto } from 'src/modules/users/dto/code-auth.dto';
import { ChangePasswordDto } from 'src/modules/users/dto/change-password.dto';
import {
  ResetPasswordDto,
  VerifyResetCodeDto,
} from 'src/modules/users/dto/change-password.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  private normalizeRole(role: string) {
    if (role === 'CUSTOMER') return 'USER';
    if (role === 'COURIER') return 'SHIPPER';
    return role;
  }

  // validate user

  async validateUser(username: string, pass: string): Promise<any> {
    const user = await this.usersService.findOneByUsername(username);
    if (!user || !user.password) return null; // ⬅️ thêm guard

    const isValid = this.usersService.isValidPassword(pass, user.password);
    if (!isValid) return null;

    if (user.isActive === false || user.isDeleted === true) return null;

    const normalizedRole = this.normalizeRole(user.role as string);
    const permissions =
      normalizedRole === 'ADMIN'
        ? ['manage_users', 'view_reports']
        : ['view_profile'];

    return { ...user.toObject(), role: normalizedRole, permissions };
  }

  ////////////////////////////////////////////
  async login(user: IUser, response: Response) {
    const { _id, name, email, role } = user;
    const payload = {
      sub: String(_id),
      iss: 'ap-post-api',
      tokenType: 'access',
      _id,
      name,
      email,
      role,
    };

    const refresh_token = this.createRefreshToken(payload);

    // Update the user with the refresh token
    await this.usersService.updateUserToken(refresh_token, _id);

    // Set the refresh_token as a cookie
    response.cookie('refresh_token', refresh_token, {
      httpOnly: true,
      secure: this.configService.get<string>('NODE_ENV') === 'production',
      sameSite:
        this.configService.get<string>('NODE_ENV') === 'production'
          ? 'none'
          : 'lax',
      path: '/api',
      maxAge: ms(this.configService.get<string>('JWT_REFRESH_EXPIRE')),
    });

    // Lấy user đã populate (branchId, role, ...).
    // Sử dụng usersService.findOne để đảm bảo select('-password') + populate được thực hiện.
    const fullUser = await this.usersService.findOne(_id as string);

    return {
      access_token: this.jwtService.sign(payload),
      user: fullUser ? fullUser : { _id, name, email, role },
    };
  }

  ////////////////// register

  async register(user: RegisterUserDto) {
    const newUser = await this.usersService.register(user);

    return {
      _id: newUser?._id,
      createdAt: newUser?.createdAt,
    };
  }

  /// verify email code

  checkCode = async (data: CodeAuthDto) => {
    return await this.usersService.handleActive(data);
  };

  verifyResetCode(data: VerifyResetCodeDto) {
    return this.usersService.verifyResetCode(data);
  }

  /// re-send email code
  retryActive = async (data: string) => {
    return await this.usersService.retryActive(data);
  };

  /// re-send mail password
  retryPassword = async (data: string) => {
    return await this.usersService.retryPassword(data);
  };

  /// change password
  changePassword = async (data: ChangePasswordDto) => {
    return await this.usersService.changePassword(data);
  };

  // Bổ sung đổi mật khẩu (FE)
  resetPassword(data: ResetPasswordDto) {
    return this.usersService.resetPassword(data);
  }

  createRefreshToken = (payload: any) => {
    const refresh_token = this.jwtService.sign(
      { ...payload, tokenType: 'refresh' },
      {
        secret: this.configService.get<string>('JWT_REFRESH_TOKEN'),
        expiresIn:
          ms(this.configService.get<string>('JWT_REFRESH_EXPIRE')) / 1000,
      },
    );
    return refresh_token;
  };

  processNewToken = async (refreshToken: string, response: Response) => {
    try {
      if (!refreshToken) {
        throw new BadRequestException('Refresh token is required');
      }
      const decoded = this.jwtService.verify<{ tokenType?: string }>(
        refreshToken,
        {
          secret: this.configService.get<string>('JWT_REFRESH_TOKEN'),
          issuer: 'ap-post-api',
        },
      );
      if (decoded.tokenType !== 'refresh') {
        throw new BadRequestException('Invalid refresh token');
      }
      const user = await this.usersService.findUserByToken(refreshToken);
      if (user) {
        const { _id, name, email, role } = user;
        const payload = {
          sub: String(_id),
          iss: 'ap-post-api',
          tokenType: 'access',
          _id,
          name,
          email,
          role,
        };

        const newRefreshToken = this.createRefreshToken(payload);

        // Update the user with the refresh token
        await this.usersService.updateUserToken(
          newRefreshToken,
          _id.toString(),
        );

        // Clear the old refresh_token cookie
        this.clearRefreshCookie(response);

        // Set the new refresh_token as a cookie
        response.cookie('refresh_token', newRefreshToken, {
          httpOnly: true,
          secure: this.configService.get<string>('NODE_ENV') === 'production',
          sameSite:
            this.configService.get<string>('NODE_ENV') === 'production'
              ? 'none'
              : 'lax',
          path: '/api',
          maxAge: ms(this.configService.get<string>('JWT_REFRESH_EXPIRE')),
        });

        // Lấy lại user đầy đủ (populate branchId)
        const fullUser = await this.usersService.findOne(_id.toString());

        return {
          access_token: this.jwtService.sign(payload),
          user: fullUser ? fullUser : { _id, name, email, role },
        };
      } else {
        throw new BadRequestException(
          `The refresh token is invalid. Please log in.`,
        );
      }
    } catch {
      throw new BadRequestException(
        `The refresh token is invalid. Please log in.`,
      );
    }
  };

  logout = async (response: Response, refreshToken?: string) => {
    if (refreshToken) {
      const user = await this.usersService.findUserByToken(refreshToken);
      if (user) {
        await this.usersService.updateUserToken('', user._id.toString());
      }
    }
    this.clearRefreshCookie(response);
    return 'ok';
  };

  private clearRefreshCookie(response: Response): void {
    response.clearCookie('refresh_token', {
      httpOnly: true,
      secure: this.configService.get<string>('NODE_ENV') === 'production',
      sameSite:
        this.configService.get<string>('NODE_ENV') === 'production'
          ? 'none'
          : 'lax',
      path: '/api',
    });
  }
}
