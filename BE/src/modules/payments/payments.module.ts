import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { Payment, PaymentSchema } from './schemas/payment.schema';
import { OrdersModule } from '../orders/orders.module';
import { VnpayService } from './vnpay.service';
import { VnpayController } from './vnpay.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Payment.name, schema: PaymentSchema }]),
    forwardRef(() => OrdersModule),
  ],
  controllers: [PaymentsController, VnpayController],
  providers: [PaymentsService, VnpayService],
  exports: [MongooseModule, PaymentsService, VnpayService],
})
export class PaymentsModule {}
