import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { Order, OrderSchema } from './schemas/order.schemas';
import { LocationModule } from '../location/location.module';
import { PricingModule } from '../pricing/pricing.module';
import { MailService } from 'src/mail/mail.service';
import { PaymentsModule } from '../payments/payments.module';
import { HttpModule } from '@nestjs/axios';
import { VietQrModule } from '../vietqr/vietqr.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
    LocationModule,
    PricingModule,
    forwardRef(() => PaymentsModule),
    HttpModule,
    VietQrModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, MailService],
  exports: [MongooseModule, OrdersService],
})
export class OrdersModule {}
