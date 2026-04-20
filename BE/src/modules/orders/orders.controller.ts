// src/orders/orders.controller.ts
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
  BadRequestException,
  Req,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Public, ResponseMessage, Users } from 'src/health/decorator/customize';
import { IUser } from 'src/types/user.interface';
import { OrderStatus } from './schemas/order.schemas';
import { OrdersService } from './orders.service';
import { Roles } from 'src/health/decorator/roles.decorator';
import { ConfigService } from '@nestjs/config';
import { MomoService } from '../momo/momo.service';

@ApiTags('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly momoService: MomoService,
    private readonly configService: ConfigService,
  ) {}

  // ====================== 1. TẠO ĐƠN HÀNG ======================
  @Post()
  @ResponseMessage('Tạo đơn hàng mới')
  async create(@Body() dto: CreateOrderDto, @Users() user: IUser) {
    console.log('🔥 [CREATE ORDER] paymentMethod =', dto.paymentMethod);

    const result = await this.ordersService.create(dto, user);

    const method = dto.paymentMethod || 'CASH';
    let redirectUrl: string | null = null;

    if (method === 'MOMO') {
      console.log('🔥 Đang gọi MOMO gateway');
      redirectUrl = await this.initiateGateway(method, result.order, result.payment);
      console.log('🔥 Kết quả redirectUrl =', redirectUrl);
    }

    return {
      order: result.order,
      payment: result.payment,
      redirectUrl,
      message: method === 'MOMO'
        ? 'Đang chuyển hướng đến cổng thanh toán MOMO...'
        : 'Tạo đơn hàng thành công',
    };
  }

  // ====================== 2. DANH SÁCH ======================
  @Get()
  @ResponseMessage('Danh sách đơn hàng')
  findAll(
    @Req() req,
    @Query('current') current?: string,
    @Query('pageSize') limit?: string,
    @Query() query?: any,
  ) {
    const user = req.user;
    if (!user?._id) {
      throw new BadRequestException('User không hợp lệ');
    }

    const page = current ? Number(current) : 1;
    const size = limit ? Number(limit) : 10;

    return this.ordersService.findAll(user, page, size, query || {});
  }

  // ====================== 3. THỐNG KÊ (PHẢI ĐẶT TRƯỚC :id) ======================
  @Roles('ADMIN', 'STAFF')
  @Get('statistics')
  @ResponseMessage('Thống kê đơn hàng')
  async getStatistics(
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Users() user?: IUser,
  ) {
    const isAdmin = user?.role === 'ADMIN';
    const m = month ? Number(month) : undefined;
    const y = year ? Number(year) : undefined;
    return this.ordersService.getStatistics(m, y, isAdmin ? null : user);
  }

  // ====================== 4. CHI TIẾT ĐƠN HÀNG (dynamic route) ======================
  @Public()
  @Get(':id')
  @ResponseMessage('Chi tiết đơn hàng')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  // ====================== CÁC ROUTE KHÁC ======================
  @Patch(':id')
  @ResponseMessage('Cập nhật đơn hàng')
  update(@Param('id') id: string, @Body() dto: UpdateOrderDto) {
    return this.ordersService.update(id, dto);
  }

  @Patch(':id/status/:status')
  @ResponseMessage('Cập nhật trạng thái đơn hàng')
  updateStatus(
    @Param('id') id: string,
    @Param('status') status: OrderStatus,
    @Users() user: IUser,
  ) {
    return this.ordersService.updateStatus(id, status, user);
  }

  @Delete(':id')
  @ResponseMessage('Xóa đơn hàng (soft)')
  remove(@Param('id') id: string, @Users() user: IUser) {
    return this.ordersService.remove(id, user);
  }

  @Public()
  @Get(':id/status')
  @ResponseMessage('Lấy trạng thái đơn hàng theo ID')
  getStatusById(@Param('id') id: string) {
    return this.ordersService.getStatusById(id);
  }

  @Patch(':id/confirm-payment')
  @ResponseMessage('Xác nhận thanh toán QR thủ công')
  async confirmPayment(@Param('id') id: string) {
    return this.ordersService.confirmPayment(id);
  }

  // ====================== PRIVATE HELPER ======================
  private async initiateGateway(
    method: string,
    order: any,
    payment: any,
  ): Promise<string | null> {
    if (method === 'MOMO') {
      try {
        const amount = Number(payment.amount) || Number(order.totalOrderValue) || 0;
        const orderInfo = `Thanh toan don hang AP Post - ${order.waybill}`;

        const result = await this.momoService.createPayment(
          order._id.toString(),
          amount,
          orderInfo,
        );

        return result.payUrl;
      } catch (error) {
        console.error('MOMO initiate error:', error);
        throw new BadRequestException('Không thể tạo link thanh toán MOMO');
      }
    }
    return null;
  }
}