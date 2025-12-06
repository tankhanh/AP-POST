// src/modules/payfake/payfake.module.ts
import { Module } from '@nestjs/common';
import { PayfakeController } from './payfake.controller';
import { PayfakeService } from './payfake.service';
import { PaymentsModule } from '../payments/payments.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '../orders/schemas/order.schemas';

@Module({
  imports: [
    PaymentsModule,
    MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
  ],
  controllers: [PayfakeController],
  providers: [PayfakeService],
  exports: [PayfakeService],
})
export class PayfakeModule {}