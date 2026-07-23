import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ResponseMessage, Users } from 'src/health/decorator/customize';
import { IUser } from 'src/types/user.interface';
import { Roles } from 'src/health/decorator/roles.decorator';

@ApiTags('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  @Roles('ADMIN', 'STAFF')
  @ResponseMessage('Tạo thông báo mới')
  create(@Body() dto: CreateNotificationDto) {
    return this.notificationsService.create(dto);
  }

  @Get()
  @ResponseMessage('Danh sách thông báo')
  findAll(
    @Query('current') currentPage: string,
    @Query('pageSize') limit: string,
    @Query() qs?: any,
    @Users() user?: IUser,
  ) {
    return this.notificationsService.findAll(
      +currentPage,
      +limit,
      qs || {},
      user,
    );
  }

  @Get(':id')
  @ResponseMessage('Chi tiết thông báo')
  findOne(@Param('id') id: string, @Users() user: IUser) {
    return this.notificationsService.findOne(id, user);
  }
  @Patch('mark-all-read')
  @ResponseMessage('Đánh dấu tất cả đã đọc')
  markAllRead(@Users() user: IUser) {
    return this.notificationsService.markAllRead(user);
  }

  @Patch(':id')
  @ResponseMessage('Cập nhật thông báo')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateNotificationDto,
    @Users() user: IUser,
  ) {
    return this.notificationsService.update(id, dto, user);
  }

  @Delete(':id')
  @ResponseMessage('Xóa thông báo')
  remove(@Param('id') id: string, @Users() user: IUser) {
    return this.notificationsService.remove(id, user);
  }
}
