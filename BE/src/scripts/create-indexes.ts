import 'dotenv/config';
import mongoose, { Model, Schema } from 'mongoose';
import {
  Address,
  AddressSchema,
} from '../modules/location/schemas/address.schema';
import {
  Branch,
  BranchSchema,
} from '../modules/branches/schemas/branch.schemas';
import {
  Commune,
  CommuneSchema,
} from '../modules/location/schemas/commune.schema';
import {
  Notification,
  NotificationSchema,
} from '../modules/notifications/schemas/notification.schemas';
import { Order, OrderSchema } from '../modules/orders/schemas/order.schemas';
import {
  Payment,
  PaymentSchema,
} from '../modules/payments/schemas/payment.schema';
import {
  Pricing,
  PricingSchema,
} from '../modules/pricing/schemas/pricing.schemas';
import {
  Province,
  ProvinceSchema,
} from '../modules/location/schemas/province.schema';
import {
  PublicOrderOtp,
  PublicOrderOtpSchema,
} from '../modules/orders/schemas/public-order-otp.schema';
import {
  Service,
  ServiceSchema,
} from '../modules/services/schemas/service.schemas';
import {
  Shipment,
  ShipmentSchema,
} from '../modules/shipments/schemas/shipment.schema';
import {
  Tracking,
  TrackingSchema,
} from '../modules/tracking/schemas/tracking.schemas';
import { User, UserSchema } from '../modules/users/schemas/user.schema';

const definitions: Array<[string, Schema]> = [
  [Address.name, AddressSchema],
  [Branch.name, BranchSchema],
  [Commune.name, CommuneSchema],
  [Notification.name, NotificationSchema],
  [Order.name, OrderSchema],
  [Payment.name, PaymentSchema],
  [Pricing.name, PricingSchema],
  [Province.name, ProvinceSchema],
  [PublicOrderOtp.name, PublicOrderOtpSchema],
  [Service.name, ServiceSchema],
  [Shipment.name, ShipmentSchema],
  [Tracking.name, TrackingSchema],
  [User.name, UserSchema],
];

async function createIndexes(): Promise<void> {
  const uri = process.env.MONGO_URL;
  if (!uri) throw new Error('MONGO_URL is required');

  const connection = await mongoose.createConnection(uri).asPromise();
  try {
    for (const [name, schema] of definitions) {
      const model = connection.model(name, schema) as Model<unknown>;
      try {
        await model.createIndexes();
      } catch (error) {
        const code = (error as { code?: number }).code;
        const isOtpTtlConflict =
          name === PublicOrderOtp.name && (code === 85 || code === 86);
        if (!isOtpTtlConflict || !connection.db) throw error;

        // Older deployments retained expired OTP documents for 24 hours. Keep
        // the existing index and update its TTL option without dropping data.
        await connection.db.command({
          collMod: model.collection.collectionName,
          index: { name: 'expiresAt_1', expireAfterSeconds: 0 },
        });
        await model.createIndexes();
      }
      console.log(`Indexes ready: ${model.collection.collectionName}`);
    }
  } finally {
    await connection.close();
  }
}

createIndexes().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
