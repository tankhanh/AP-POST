import { HttpModule } from '@nestjs/axios';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import googleOauthConfig from './config/google_oauth_config';
import { validateEnvironment } from './config/validate-environment';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { BranchesModule } from './modules/branches/branches.module';
import { DatabasesModule } from './modules/databases/databases.module';
import { FilesModule } from './modules/files/files.module';
import { LocationModule } from './modules/location/location.module';
import { MomoModule } from './modules/momo/momo.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { ServicesModule } from './modules/services/services.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { UsersModule } from './modules/users/users.module';
import { MailModule } from './modules/mail/mail.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      load: [googleOauthConfig],
      validate: validateEnvironment,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGO_URL'),
        autoIndex: configService.get<string>('NODE_ENV') !== 'production',
        maxPoolSize: 20,
        serverSelectionTimeoutMS: 10_000,
      }),
    }),
    HttpModule.register({
      timeout: 30_000,
      maxRedirects: 3,
    }),
    MailModule,
    UsersModule,
    AuthModule,
    FilesModule,
    DatabasesModule,
    HealthModule,
    BranchesModule,
    ServicesModule,
    OrdersModule,
    PaymentsModule,
    PricingModule,
    TrackingModule,
    NotificationsModule,
    LocationModule,
    DashboardModule,
    MomoModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    Logger,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
