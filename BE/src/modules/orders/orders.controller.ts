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
import { VietQrService } from '../vietqr/vietqr.service';

@ApiTags('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly vietQrService: VietQrService,
  ) {}

  @Post()
  @ResponseMessage('Tạo đơn hàng mới')
  async create(@Body() dto: CreateOrderDto, @Users() user: IUser) {
    const result = await this.ordersService.create(dto, user);

    const method = dto.paymentMethod || 'CASH';

    // Redirect URL chỉ cần thiết cho các cổng thanh toán gateway
    let redirectUrl: string | null = null;
    if (['MOMO', 'VNPAY', 'BANK_TRANSFER', 'FAKE', 'CARD'].includes(method)) {
      // TODO: Nếu bạn còn dùng gateway thật thì implement initiateGateway ở đây
      // redirectUrl = await this.initiateGateway(method, result.order, result.payment);
    }

    return {
      order: result.order,
      payment: result.payment,
      qrUrl: result.qrUrl,
      redirectUrl,
      message:
        method === 'QR'
          ? 'Vui lòng quét mã QR để thanh toán'
          : 'Tạo đơn hàng thành công',
    };
  }

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

  @Public()
  @Get(':id')
  @ResponseMessage('Chi tiết đơn hàng')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Public()
  @Get(':id/qr')
  @ResponseMessage('Lấy mã QR thanh toán')
  async getQr(@Param('id') id: string) {
    try {
      const order = await this.ordersService.findOne(id);

      if (!order) {
        throw new NotFoundException('Không tìm thấy đơn hàng');
      }

      if (order.paymentMethod !== 'QR') {
        throw new BadRequestException(
          'Đơn hàng này không sử dụng thanh toán QR',
        );
      }

      if (order.status !== OrderStatus.PENDING) {
        throw new BadRequestException(
          'Chỉ đơn hàng đang chờ (PENDING) mới có thể thanh toán bằng QR',
        );
      }

      const amount =
        Number(order.senderPayAmount) ||
        Number(order.totalOrderValue) ||
        Number(order.totalPrice) ||
        0;

      if (amount <= 0) {
        throw new BadRequestException('Số tiền thanh toán không hợp lệ');
      }

      const qrUrl = this.vietQrService.generateQrUrl(
        amount,
        order.waybill,
        `Thanh toan don hang AP Post - ${order.waybill}`,
      );

      return {
        success: true,
        qrUrl: qrUrl,
        amount: amount,
        waybill: order.waybill,
        orderId: order._id,
      };
    } catch (error: any) {
      console.error('Get QR error:', error);
      throw error;
    }
  }

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

  // ====================== PRIVATE HELPER (nếu bạn còn dùng gateway) ======================
  // private async initiateGateway(
  //   method: string,
  //   order: any,
  //   payment: any,
  // ): Promise<string | null> {
  //   // Implement logic MOMO, VNPAY, FAKE... ở đây nếu cần
  //   return null;
  // }
}
