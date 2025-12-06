import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { Order, OrderSchema } from './schemas/order.schemas';
import { LocationModule } from '../location/location.module';
import { PricingModule } from '../pricing/pricing.module';
import { MailService } from 'src/mail/mail.service';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
    LocationModule,
    PricingModule,
    PaymentsModule
  ],
  controllers: [OrdersController],
  providers: [OrdersService,MailService],

  exports: [MongooseModule, OrdersService],
})
export class OrdersModule {}
