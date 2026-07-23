import { Module } from '@nestjs/common';
import { DatabasesService } from './databases.service';
import { UsersModule } from '../users/users.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { BranchesModule } from '../branches/branches.module';
import { ServicesModule } from '../services/services.module';
import { TrackingModule } from '../tracking/tracking.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PricingModule } from '../pricing/pricing.module';
import { LocationModule } from '../location/location.module';

@Module({
  imports: [
    UsersModule,
    OrdersModule,
    PaymentsModule,
    BranchesModule,
    ServicesModule,
    TrackingModule,
    NotificationsModule,
    PricingModule,
    LocationModule,
  ],
  providers: [DatabasesService],
})
export class DatabasesModule {}
