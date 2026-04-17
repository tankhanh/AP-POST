import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VnpayService } from './vnpay.service';
import { VnpayController } from './vnpay.controller';
import { Payment, PaymentSchema } from '../payments/schemas/payment.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schemas';
import { PaymentsModule } from '../payments/payments.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: Order.name, schema: OrderSchema },
    ]),
    forwardRef(() => PaymentsModule),
    ConfigModule,
  ],
  controllers: [VnpayController],
  providers: [VnpayService],
  exports: [VnpayService],
})
export class VnpayModule {}