import { forwardRef, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { MomoController } from './momo.controller';
import { MomoService } from './momo.service';
import { PaymentsModule } from '../payments/payments.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    forwardRef(() => PaymentsModule),
    forwardRef(() => OrdersModule),
  ],
  controllers: [MomoController],
  providers: [MomoService],
  exports: [MomoService],
})
export class MomoModule {}
