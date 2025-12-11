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
import { PaymentsService } from '../payments/payments.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom, map } from 'rxjs';

@ApiTags('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly paymentsService: PaymentsService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  @Post()
  @ResponseMessage('Tạo đơn hàng mới')
  async create(@Body() dto: CreateOrderDto, @Users() user: IUser) {
    const order = await this.ordersService.create(dto, user);
    const method = dto.paymentMethod || 'CASH';

    // Tính amount dựa trên order
    const shippingFeePayer = dto.shippingFeePayer || 'SENDER';
    const codValue = Number(dto.codValue) || 0;
    const shippingFee = order.shippingFee || 0;
    let amount = 0;
    if (shippingFeePayer === 'SENDER') {
      amount = shippingFee + codValue;  // Người gửi trả hết
    } else {
      amount = shippingFee;  // Người gửi trả ship, receiver trả COD
    }

    // Tạo payment
    const payment = await this.paymentsService.createPaymentForOrder(order._id.toString(), {
      method,
      amount,
      status: method === 'CASH' ? 'paid' : 'pending',
      transactionId: order.waybill,
      createdBy: { _id: user._id, email: user.email },
    });

    // Nếu online, initiate gateway và trả về redirectUrl
    let redirectUrl: string | null = null;
    if (['MOMO', 'VNPAY', 'BANK_TRANSFER', 'FAKE', 'CARD', 'QR'].includes(method)) {
      redirectUrl = await this.initiateGateway(method, order, payment);
    }

    return { order, payment, redirectUrl };
  }

  private async initiateGateway(method: string, order: any, payment: any): Promise<string | null> {
    if (method === 'FAKE') {
      // const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'https://ap-post.vercel.app';
      // const returnUrl = `${frontendUrl}/order-success?orderId=${order._id}`;

      // const payload = {
      //   app_name: 'APPost',
      //   service: order.details || 'Shipping Service',
      //   customer_email: order.email || 'noemail@appost.com',
      //   card_type: 'VISA',
      //   card_holder_name: order.senderName || 'Test User',
      //   card_number: '4242424242424242',
      //   expiryMonth: '12',
      //   expiryYear: '2030',
      //   cvv: '123',
      //   amount: Math.round(payment.amount),
      //   currency: 'VND',
      //   order_id: order._id,
      //   order_info: `Thanh toán đơn ${order.waybill} - APPost`,
      //   return_url: returnUrl,
      // };

      // try {
      //   console.log('Sending payload to gateway:', JSON.stringify(payload));
      //   const gatewayResponse = await lastValueFrom(
      //     this.httpService.post('https://fake-payment-tkh.onrender.com/api/v1/payment/card', payload)
      //       .pipe(map((res: any) => res.data))
      //   ) as { success: boolean; message?: string };

      //   if (gatewayResponse.success) {
      //     await this.paymentsService.updatePaymentStatusByTransaction(order.waybill, 'paid');
      //     return `${returnUrl}&status=paid&msg=${encodeURIComponent('Thanh toán thành công')}`;
      //   } else {
      //     await this.paymentsService.updatePaymentStatusByTransaction(order.waybill, 'failed');
      //     return `${returnUrl}&status=failed&msg=${encodeURIComponent(gatewayResponse.message || 'Thanh toán thất bại')}`;
      //   }
      // } catch (err) {
      //   await this.paymentsService.updatePaymentStatusByTransaction(order.waybill, 'failed');
      //   throw new BadRequestException('Lỗi kết nối gateway: ' + (err.message || 'Unknown'));
      // }
    }
    // Thêm logic cho MOMO, VNPAY, CARD, QR tương tự (sử dụng API của chúng)
    return null;
  }

  @Get()
  @ResponseMessage('Danh sách đơn hàng')
  findAll(
    @Req() req,
    @Query('current') current?: string,
    @Query('pageSize') limit?: string,
    @Query() query?: any,
  ) {
    const page = current ? Number(current) : 1;
    const size = limit ? Number(limit) : 10;

    const user = req.user;
    if (!user?._id) {
      throw new BadRequestException('User không hợp lệ');
    }

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
}