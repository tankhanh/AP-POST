import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/health/decorator/roles.decorator';
import { PaymentsService } from './payments.service';
import { IsEnum, IsIn } from 'class-validator';
import { PaymentStatus } from './schemas/payment.schema';
import { MANUAL_PAYMENT_METHODS, PaymentMethod } from './payment.constants';

class ManualPaymentDto {
  @IsIn(MANUAL_PAYMENT_METHODS)
  method: PaymentMethod;
}

class PaymentStatusDto {
  @IsEnum(PaymentStatus)
  status: PaymentStatus;
}

@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post(':orderId')
  @Roles('ADMIN', 'STAFF')
  create(@Param('orderId') orderId: string, @Body() dto: ManualPaymentDto) {
    return this.paymentsService.create(orderId, dto.method);
  }

  @Get()
  @Roles('ADMIN', 'STAFF')
  findAll() {
    return this.paymentsService.findAll();
  }

  @Get(':id')
  @Roles('ADMIN', 'STAFF')
  findOne(@Param('id') id: string) {
    return this.paymentsService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'STAFF')
  updateStatus(@Param('id') id: string, @Body() dto: PaymentStatusDto) {
    return this.paymentsService.updateStatus(id, dto.status);
  }
}
