import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { Order, OrderSchema } from './schemas/order.schemas';
import { LocationModule } from '../location/location.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PricingModule } from '../pricing/pricing.module';
import { PaymentsModule } from '../payments/payments.module';
import { HttpModule } from '@nestjs/axios';
import { MailService } from '../mail/mail.service';
import { MomoModule } from '../momo/momo.module';
import { Branch, BranchSchema } from '../branches/schemas/branch.schemas';
import {
  PublicOrderOtp,
  PublicOrderOtpSchema,
} from './schemas/public-order-otp.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: Branch.name, schema: BranchSchema },
      { name: PublicOrderOtp.name, schema: PublicOrderOtpSchema },
    ]),
    // user lookup + notifications
    UsersModule,
    NotificationsModule,
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
