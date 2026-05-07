import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PublicOrderOtpDocument = HydratedDocument<PublicOrderOtp>;

@Schema({ timestamps: true })
export class PublicOrderOtp {
  @Prop({ required: true, index: true })
  phone: string;

  @Prop({ required: true })
  code: string;

  @Prop({ required: true, unique: true, index: true })
  token: string;

  @Prop({ required: true, default: 0 })
  attempts: number;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop()
  verifiedAt?: Date;

  @Prop()
  usedAt?: Date;
}

export const PublicOrderOtpSchema = SchemaFactory.createForClass(PublicOrderOtp);
PublicOrderOtpSchema.index({ phone: 1, createdAt: -1 });
