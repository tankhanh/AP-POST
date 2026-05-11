import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { softDeletePlugin } from 'soft-delete-plugin-mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { HealthModule } from './health/health.module';
import google_oauth_config from './config/google_oauth_config';
import { MailerModule } from '@nestjs-modules/mailer';
// import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';
import { UsersModule } from './modules/users/users.module';
import { FilesModule } from './modules/files/files.module';
import { DatabasesModule } from './modules/databases/databases.module';
import { ShipmentsModule } from './modules/shipments/shipments.module';
import { BranchesModule } from './modules/branches/branches.module';
import { ServicesModule } from './modules/services/services.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrdersModule } from './modules/orders/orders.module';
import { LocationModule } from './modules/location/location.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PayfakeModule } from './modules/payfake/payfake.module';
import { HttpModule } from '@nestjs/axios';
import { VietQrModule } from './modules/vietqr/vietqr.module';
import { VnpayModule } from './modules/vnpay/vnpay.module';
import { join } from 'path';
import { MomoModule } from './modules/momo/momo.module';
import { existsSync } from 'fs';
import { MailModule } from './modules/mail/mail.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot({
      ///limit api call
      ttl: 60,
      limit: 10,
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGO_URL'),
        connectionFactory: (connection) => {
          connection.plugin(softDeletePlugin);
          return connection;
        },
      }),
    }),

    ConfigModule.forRoot({
      isGlobal: true,
      load: [google_oauth_config],
    }),
    UsersModule,
    AuthModule,
    FilesModule,
    DatabasesModule,
    HealthModule,
    ShipmentsModule,
    BranchesModule,
    ServicesModule,
    OrdersModule,
    PaymentsModule,
    PricingModule,
    TrackingModule,
    NotificationsModule,
    LocationModule,
    DashboardModule,
    PayfakeModule,
    HttpModule,
    VietQrModule,
    VnpayModule,
    MomoModule,
    MailModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
