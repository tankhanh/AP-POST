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
  Logger,
  ParseEnumPipe,
  DefaultValuePipe,
  ParseIntPipe,
  Inject,
  forwardRef,
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
import { MomoInitiationError, MomoService } from '../momo/momo.service';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';
import { PaymentMethod } from '../payments/payment.constants';
import { PaymentStatus } from '../payments/schemas/payment.schema';
import { PaymentsService } from '../payments/payments.service';
import {
  AssignShipperDto,
  CompleteDeliveryDto,
  DeliveryLocationDto,
  FailDeliveryDto,
  RejectAssignmentDto,
  ShipperJobsView,
} from './dto/shipper-order.dto';

class PublicOtpRequestDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsEmail()
  email: string;
}

class PublicOtpVerifyDto extends PublicOtpRequestDto {
  @IsString()
  @IsNotEmpty()
  code: string;
}

@ApiTags('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name);
  constructor(
    private readonly ordersService: OrdersService,
    private readonly momoService: MomoService,
    private readonly paymentsService: PaymentsService,
    private readonly configService: ConfigService,
  ) {}

  // ====================== 1. TẠO ĐƠN HÀNG ======================
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('public/request-otp')
  @ResponseMessage('Gửi OTP tạo đơn B2C')
  requestPublicOtp(@Body() body: PublicOtpRequestDto) {
    return this.ordersService.requestPublicOtp(body.phone, body.email);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post('public/verify-otp')
  @ResponseMessage('Xác thực OTP tạo đơn B2C')
  verifyPublicOtp(@Body() body: PublicOtpVerifyDto) {
    return this.ordersService.verifyPublicOtp(
      body.phone,
      body.email,
      body.code,
    );
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post('public')
  @ResponseMessage('Tạo đơn hàng B2C (khách lẻ)')
  async createPublic(@Body() dto: CreateOrderDto, @Req() request: Request) {
    this.logger.debug(`Creating public order with ${dto.paymentMethod}`);
    this.assertGatewayConfigured(dto.paymentMethod);

    const result = await this.ordersService.createPublic(dto);
    const method = dto.paymentMethod || PaymentMethod.CASH;
    let paymentAttempt = null;
    let paymentError = null;

    if (method === PaymentMethod.MOMO) {
      try {
        const momoResult = await this.momoService.createPayment(
          result.order._id.toString(),
          result.payment.amount,
          `AP Post ${result.order.waybill ?? result.order._id}`,
        );
        paymentAttempt = {
          payUrl: momoResult.payUrl,
          transactionCode: momoResult.transactionCode,
          expiresAt: momoResult.expiresAt,
          orderId: result.order._id.toString(),
        };
      } catch (error) {
        paymentError =
          error instanceof Error
            ? error.message
            : 'Không thể khởi tạo giao dịch MoMo';
      }
    }

    return {
      order: result.order,
      payment: result.payment,
      redirectUrl: null,
      paymentAttempt,
      paymentError,
      message: 'Tạo đơn hàng B2C thành công',
    };
  }

  @Post()
  @ResponseMessage('Tạo đơn hàng mới')
  async create(
    @Body() dto: CreateOrderDto,
    @Users() user: IUser,
    @Req() request: Request,
  ) {
    this.logger.debug(`Creating order with ${dto.paymentMethod}`);
    this.assertGatewayConfigured(dto.paymentMethod);

    const result = await this.ordersService.create(dto, user);
    const method = dto.paymentMethod || PaymentMethod.CASH;
    let paymentAttempt = null;
    let paymentError = null;

    if (method === PaymentMethod.MOMO) {
      try {
        const momoResult = await this.momoService.createPayment(
          result.order._id.toString(),
          result.payment.amount,
          `AP Post ${result.order.waybill ?? result.order._id}`,
        );
        paymentAttempt = {
          payUrl: momoResult.payUrl,
          transactionCode: momoResult.transactionCode,
          expiresAt: momoResult.expiresAt,
          orderId: result.order._id.toString(),
        };
      } catch (error) {
        paymentError =
          error instanceof Error
            ? error.message
            : 'Không thể khởi tạo giao dịch MoMo';
      }
    }

    return {
      order: result.order,
      payment: result.payment,
      redirectUrl: null,
      paymentAttempt,
      paymentError,
      message: 'Tạo đơn hàng thành công',
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
  @Roles('SHIPPER')
  @Get('shipper/jobs')
  @ResponseMessage('Danh sách đơn giao của shipper')
  getShipperJobs(
    @Users() user: IUser,
    @Query('current', new DefaultValuePipe(1), ParseIntPipe) current: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe)
    pageSize: number,
    @Query(
      'view',
      new DefaultValuePipe(ShipperJobsView.ACTIVE),
      new ParseEnumPipe(ShipperJobsView),
    )
    view: ShipperJobsView,
    @Query('search') search?: string,
  ) {
    return this.ordersService.getShipperJobs(
      user,
      current,
      pageSize,
      view,
      search,
    );
  }

  @Roles('SHIPPER')
  @Get('shipper/summary')
  @ResponseMessage('Tổng quan công việc shipper')
  getShipperSummary(@Users() user: IUser) {
    return this.ordersService.getShipperSummary(user);
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

  // ====================== 4. CHI TIẾT ĐƠN HÀNG (dynamic route) ======================
  @Get(':id')
  @ResponseMessage('Chi tiết đơn hàng')
  findOne(@Param('id') id: string, @Users() user: IUser) {
    return this.ordersService.findOne(id, user);
  }

  // ====================== CÁC ROUTE KHÁC ======================
  @Post(':id/momo-payment')
  @Roles('ADMIN', 'STAFF')
  @ResponseMessage('Khởi tạo giao dịch MoMo cho đơn hàng')
  async initiateMomoPayment(
    @Param('id') id: string,
    @Users() user: IUser,
    @Req() request: Request,
  ) {
    const order = await this.ordersService.findOne(id, user);
    if (order.paymentMethod !== PaymentMethod.MOMO) {
      throw new BadRequestException('Đơn này không sử dụng phương thức MOMO');
    }
    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        'Chỉ đơn đang chờ xác nhận mới được thanh toán MOMO',
      );
    }

    const payment = await this.paymentsService.findByOrderId(id);
    if (!payment) {
      throw new BadRequestException(
        'Không tìm thấy giao dịch MOMO cho đơn hàng',
      );
    }

    const orderAmount = Number(payment.amount);
    const result = await this.momoService.createPayment(
      id,
      orderAmount,
      `AP Post ${order.waybill ?? id}`,
    );

    return {
      success: true,
      data: {
        payUrl: result.payUrl,
        transactionCode: result.transactionCode,
        expiresAt: result.expiresAt,
      },
    };
  }

  @Patch(':id')
  @ResponseMessage('Cập nhật đơn hàng')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOrderDto,
    @Users() user: IUser,
  ) {
    return this.ordersService.update(id, dto, user);
  }

  @Patch(':id/status/:status')
  @Roles('ADMIN', 'STAFF')
  @ResponseMessage('Cập nhật trạng thái đơn hàng')
  updateStatus(
    @Param('id') id: string,
    @Param('status', new ParseEnumPipe(OrderStatus)) status: OrderStatus,
    @Users() user: IUser,
  ) {
    return this.ordersService.updateStatus(id, status, user);
  }

  @Patch(':id/assign-shipper')
  @Roles('ADMIN', 'STAFF')
  @ResponseMessage('Phân công shipper')
  assignShipper(
    @Param('id') id: string,
    @Body() dto: AssignShipperDto,
    @Users() user: IUser,
  ) {
    return this.ordersService.assignShipper(id, dto.shipperId, user);
  }

  @Patch(':id/auto-assign-shipper')
  @Roles('ADMIN', 'STAFF')
  @ResponseMessage('Tự động phân công shipper phù hợp nhất')
  autoAssignShipper(@Param('id') id: string, @Users() user: IUser) {
    return this.ordersService.autoAssignShipper(id, user);
  }

  @Patch('dispatch/auto-assign')
  @Roles('ADMIN', 'STAFF')
  @ResponseMessage('Tự động phân công hàng chờ giao vận')
  autoAssignDispatchQueue(@Users() user: IUser) {
    return this.ordersService.autoAssignDispatchQueue(user);
  }

  @Delete(':id/shipper')
  @Roles('ADMIN', 'STAFF')
  @ResponseMessage('Hủy phân công shipper')
  unassignShipper(@Param('id') id: string, @Users() user: IUser) {
    return this.ordersService.unassignShipper(id, user);
  }

  @Patch(':id/shipper/accept')
  @Roles('SHIPPER')
  @ResponseMessage('Shipper nhận đơn')
  acceptDelivery(@Param('id') id: string, @Users() user: IUser) {
    return this.ordersService.acceptDelivery(id, user);
  }

  @Patch(':id/shipper/reject')
  @Roles('SHIPPER')
  @ResponseMessage('Shipper từ chối đơn được phân công')
  rejectDelivery(
    @Param('id') id: string,
    @Body() dto: RejectAssignmentDto,
    @Users() user: IUser,
  ) {
    return this.ordersService.rejectDelivery(id, dto, user);
  }

  @Patch(':id/shipper/start')
  @Roles('SHIPPER')
  @ResponseMessage('Shipper bắt đầu giao')
  startDelivery(@Param('id') id: string, @Users() user: IUser) {
    return this.ordersService.startDelivery(id, user);
  }

  @Patch(':id/shipper/complete')
  @Roles('SHIPPER')
  @ResponseMessage('Shipper hoàn tất giao hàng')
  completeDelivery(
    @Param('id') id: string,
    @Body() dto: CompleteDeliveryDto,
    @Users() user: IUser,
  ) {
    return this.ordersService.completeDelivery(id, dto, user);
  }

  @Patch(':id/shipper/fail')
  @Roles('SHIPPER')
  @ResponseMessage('Shipper báo giao thất bại')
  failDelivery(
    @Param('id') id: string,
    @Body() dto: FailDeliveryDto,
    @Users() user: IUser,
  ) {
    return this.ordersService.failDelivery(id, dto, user);
  }

  @Patch(':id/shipper/retry')
  @Roles('SHIPPER')
  @ResponseMessage('Shipper tiếp tục giao lại')
  retryDelivery(@Param('id') id: string, @Users() user: IUser) {
    return this.ordersService.retryDelivery(id, user);
  }

  @Patch(':id/shipper/location')
  @Roles('SHIPPER')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ResponseMessage('Cập nhật vị trí giao hàng')
  updateDeliveryLocation(
    @Param('id') id: string,
    @Body() dto: DeliveryLocationDto,
    @Users() user: IUser,
  ) {
    return this.ordersService.updateDeliveryLocation(id, dto, user);
  }

  @Delete(':id')
  @ResponseMessage('Xóa đơn hàng (soft)')
  remove(@Param('id') id: string, @Users() user: IUser) {
    return this.ordersService.remove(id, user);
  }

  @Get(':id/status')
  @ResponseMessage('Lấy trạng thái đơn hàng theo ID')
  async getStatusById(@Param('id') id: string, @Users() user: IUser) {
    const order = await this.ordersService.findOne(id, user);
    return { _id: order._id, waybill: order.waybill, status: order.status };
  }

  @Patch(':id/confirm-payment')
  @Roles('ADMIN', 'STAFF')
  @ResponseMessage('Xác nhận thanh toán thủ công')
  async confirmPayment(@Param('id') id: string, @Users() user: IUser) {
    return this.ordersService.confirmPayment(id, user);
  }

  // ====================== PRIVATE HELPER ======================
  private getIpAddress(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    const raw =
      (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]) ||
      request.socket.remoteAddress ||
      '127.0.0.1';
    const normalized = raw.replace(/^::ffff:/, '').trim();
    return normalized === '::1' || normalized === 'unknown'
      ? '127.0.0.1'
      : normalized;
  }

  private assertGatewayConfigured(method?: PaymentMethod): void {
    if (method === PaymentMethod.MOMO && !this.momoService.isConfigured()) {
      throw new BadRequestException('Cổng thanh toán MoMo chưa được cấu hình');
    }
  }
}
