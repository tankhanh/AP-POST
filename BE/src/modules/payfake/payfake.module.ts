// src/modules/payfake/payfake.module.ts
import { forwardRef, Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '../orders/schemas/order.schemas';
import { FakePaymentController } from './payfake.controller';
import { FakePaymentService } from './payfake.service';
import { PaymentsService } from '../payments/payments.service';
import { HttpModule } from '@nestjs/axios';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [
    PaymentsModule,
    forwardRef(() => OrdersModule),
    MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
    HttpModule
  ],
  controllers: [FakePaymentController],
  providers: [FakePaymentService, PaymentsService],
  exports: [FakePaymentService],
})
export class PayfakeModule {}