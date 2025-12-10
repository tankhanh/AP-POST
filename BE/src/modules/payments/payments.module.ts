import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { Payment, PaymentSchema } from './schemas/payment.schema';
import { OrdersModule } from '../orders/orders.module';
import { FakePaymentController } from '../payfake/payfake.controller';
import { FakePaymentService } from '../payfake/payfake.service';
import { HttpModule } from '@nestjs/axios';
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Payment.name, schema: PaymentSchema }]),
    forwardRef(() => OrdersModule),
    HttpModule
  ],
  controllers: [PaymentsController,FakePaymentController],
  providers: [PaymentsService, FakePaymentService],
  exports: [MongooseModule, PaymentsService, FakePaymentService],
})
export class PaymentsModule {}
