import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { Order, OrderSchema } from './schemas/order.schemas';
import { LocationModule } from '../location/location.module';
import { PricingModule } from '../pricing/pricing.module';
import { PaymentsModule } from '../payments/payments.module';
import { HttpModule } from '@nestjs/axios';
import { MailService } from '../mail/mail.service';
import { MomoModule } from '../momo/momo.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
    LocationModule,
    PricingModule,
    forwardRef(() => PaymentsModule),
    HttpModule,
    MomoModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, MailService],
  exports: [MongooseModule, OrdersService],
})
export class OrdersModule {}
