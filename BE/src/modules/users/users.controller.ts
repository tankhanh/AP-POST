import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ResponseMessage, Users } from 'src/health/decorator/customize';
import { Roles } from 'src/health/decorator/roles.decorator';
import { IUser } from 'src/types/user.interface';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles('ADMIN')
  @ResponseMessage('Create new user')
  async create(@Body() dto: CreateUserDto, @Users() user: IUser) {
    const createdUser = await this.usersService.create(dto, user);
    return {
      _id: createdUser?._id,
      createdAt: createdUser?.createdAt,
      createdBy: createdUser?.createdBy,
    };
  }

  @Get()
  @Roles('ADMIN')
  @ResponseMessage('Fetch users with pagination')
  findAll(
    @Query('current') currentPage: string,
    @Query('pageSize') limit: string,
    @Query() query: string,
  ) {
    return this.usersService.findAll(+currentPage, +limit, query);
  }

  @Get('trash')
  @Roles('ADMIN')
  @ResponseMessage('Fetch deleted users')
  findAllDeleted(@Query() query: Record<string, unknown>) {
    return this.usersService.findAllDeleted(query);
  }

  @Get('shippers/active')
  @Roles('ADMIN', 'STAFF')
  @ResponseMessage('Fetch active shippers')
  findActiveShippers(@Users() user: IUser) {
    return this.usersService.findActiveShippers(user);
  }

  @Get(':id')
  @ResponseMessage('Fetch user by id')
  findOne(@Param('id') id: string, @Users() user: IUser) {
    const mayReadUser =
      ['ADMIN', 'STAFF'].includes(user.role) || String(user._id) === id;
    if (!mayReadUser) {
      throw new ForbiddenException('You can only view your own profile');
    }
    return this.usersService.findOne(id);
  }

  @Post(':role')
  @Roles('ADMIN')
  @ResponseMessage('Fetch users by role')
  findUserByRole(@Param('role') role: string) {
    return this.usersService.findUserByRole(role);
  }

  @Patch(':id')
  @ResponseMessage('Update a user')
  update(
    @Body() dto: UpdateUserDto,
    @Users() user: IUser,
    @Param('id') id: string,
  ) {
    return this.usersService.update(dto, user, id);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ResponseMessage('Delete a user')
  remove(@Param('id') id: string, @Users() user: IUser) {
    return this.usersService.remove(id, user);
  }

  @Patch(':id/restore')
  @Roles('ADMIN')
  @ResponseMessage('Restore a user')
  restore(@Param('id') id: string, @Users() user: IUser) {
    return this.usersService.restore(id, user);
  }

  @Delete(':id/hard')
  @Roles('ADMIN')
  @ResponseMessage('Permanently delete a user')
  hardDelete(@Param('id') id: string) {
    return this.usersService.hardDelete(id);
  }
}
