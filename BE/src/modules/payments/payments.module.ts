import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentsService } from './payments.service';
import { PaymentsController, PaymentsGatewayController } from './payments.controller';
import { Payment, PaymentSchema } from './schemas/payment.schema';
import { OrdersModule } from '../orders/orders.module';
import { FakePaymentController } from '../payfake/payfake.controller';
import { FakePaymentService } from '../payfake/payfake.service';
import { HttpModule } from '@nestjs/axios';
import { Order, OrderSchema } from '../orders/schemas/order.schemas';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Payment.name, schema: PaymentSchema }, { name: Order.name, schema: OrderSchema }]),
    forwardRef(() => OrdersModule),
    HttpModule
  ],
  controllers: [PaymentsController, PaymentsGatewayController, FakePaymentController],
  providers: [PaymentsService, FakePaymentService],
  exports: [MongooseModule, PaymentsService, FakePaymentService],
})
export class PaymentsModule { }