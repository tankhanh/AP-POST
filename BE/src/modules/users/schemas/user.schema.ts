import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument } from 'mongoose';
import { UserRole } from '../user-role.enum';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: false, select: false })
  password?: string;

  @Prop({ select: false })
  refreshToken?: string;

  @Prop()
  name: string;

  @Prop({ type: String })
  phone: string;

  @Prop({ enum: ['MALE', 'FEMALE', 'OTHER'], required: false })
  gender: string;

  @Prop()
  address: string;

  @Prop({ default: 'LOCAL', enum: ['LOCAL', 'GOOGLE', 'FACEBOOK'] })
  accountType: string;

  @Prop({
    default: UserRole.USER,
    enum: UserRole,
  })
  role: UserRole;

  @Prop()
  avatarUrl: string; // 👈 thống nhất với DTO

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ default: false })
  isActive: boolean;

  @Prop({ default: true })
  isAvailable: boolean;

  @Prop({ default: false })
  isOnline: boolean;

  @Prop()
  lastSeenAt?: Date;

  @Prop({ enum: ['MOTORBIKE', 'CAR', 'VAN'], required: false })
  vehicleType?: 'MOTORBIKE' | 'CAR' | 'VAN';

  @Prop({ uppercase: true, trim: true })
  licensePlate?: string;

  @Prop({ select: false })
  codeId: string;

  @Prop()
  codeExpired: Date;

  @Prop({ type: Object })
  createdBy: {
    _id: mongoose.Schema.Types.ObjectId;
    email: string;
  };

  @Prop({ type: Object })
  updatedBy: {
    _id: mongoose.Schema.Types.ObjectId;
    email: string;
  };

  @Prop()
  deletedAt: Date;

  @Prop({ type: Object })
  deletedBy: {
    _id: mongoose.Schema.Types.ObjectId;
    email: string;
  };

  createdAt: Date;
  updatedAt: Date;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Branch' })
  branchId: mongoose.Schema.Types.ObjectId;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ role: 1, branchId: 1, isDeleted: 1 });
UserSchema.index({ phone: 1, isDeleted: 1 });
UserSchema.index({ role: 1, isOnline: 1, lastSeenAt: -1 });
