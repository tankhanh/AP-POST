// src/modules/payfake/payfake.module.ts
import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '../orders/schemas/order.schemas';
import { FakePaymentController } from './payfake.controller';
import { FakePaymentService } from './payfake.service';

@Module({
  imports: [
    PaymentsModule,
    MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
  ],
  controllers: [FakePaymentController],
  providers: [FakePaymentService],
  exports: [FakePaymentService],
})
export class PayfakeModule {}