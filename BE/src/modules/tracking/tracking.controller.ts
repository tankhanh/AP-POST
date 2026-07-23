import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TrackingService } from './tracking.service';
import { CreateTrackingDto } from './dto/create-tracking.dto';
import { ApiTags } from '@nestjs/swagger';
import { Public, ResponseMessage, Users } from 'src/health/decorator/customize';
import { IUser } from 'src/types/user.interface';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/health/decorator/roles.decorator';
import { Throttle } from '@nestjs/throttler';

@ApiTags('tracking')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tracking')
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Post()
  @Roles('ADMIN', 'STAFF')
  @ResponseMessage('Tạo log tracking mới')
  create(@Body() dto: CreateTrackingDto, @Users() user: IUser) {
    return this.trackingService.create(dto, user);
  }

  @Get()
  @ResponseMessage('Danh sách log tracking')
  @Roles('ADMIN', 'STAFF')
  findAll(
    @Query('current') current?: string,
    @Query('pageSize') pageSize?: string,
    @Query() query?: any,
  ) {
    const page = current ? Number(current) : 1;
    const size = pageSize ? Number(pageSize) : 10;
    return this.trackingService.findAll(page, size, query || {});
  }

  @Roles('ADMIN', 'STAFF')
  @Get(':id')
  @ResponseMessage('Chi tiết tracking')
  findOne(@Param('id') id: string) {
    return this.trackingService.findOne(id);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('waybill/:waybill')
  @ResponseMessage('Lấy hành trình theo mã vận đơn (waybill)')
  async findByWaybill(@Param('waybill') waybill: string) {
    return this.trackingService.findByWaybill(waybill);
  }
}
