// src/orders/orders.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  ServiceUnavailableException,
  ConflictException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import aqp from 'api-query-params';
import { Connection, Model, Types } from 'mongoose';
import { IUser } from 'src/types/user.interface';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import {
  Order,
  OrderDocument,
  OrderStatus,
  OrderChannel,
  DeliveryState,
  AssignmentMode,
  BranchAssignmentSource,
} from './schemas/order.schemas';
import { Address, AddressDocument } from '../location/schemas/address.schema';
import { Commune, CommuneDocument } from '../location/schemas/commune.schema';
import {
  Province,
  ProvinceDocument,
} from '../location/schemas/province.schema';
import { PricingService } from '../pricing/pricing.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/schemas/notification.schemas';
import { User, UserDocument } from '../users/schemas/user.schema';
import { ProvinceCode } from 'src/types/location.type';
import { Tracking } from '../tracking/schemas/tracking.schemas';
import { PaymentsService } from '../payments/payments.service';
import { MailService } from '../mail/mail.service';
import { Branch, BranchDocument } from '../branches/schemas/branch.schemas';
import { createHmac, randomBytes, randomInt } from 'crypto';
import dayjs from 'dayjs';
import { ConfigService } from '@nestjs/config';
import {
  PublicOrderOtp,
  PublicOrderOtpDocument,
} from './schemas/public-order-otp.schema';
import {
  MANUAL_PAYMENT_METHODS,
  ONLINE_PAYMENT_METHODS,
  PaymentMethod,
} from '../payments/payment.constants';
import { PaymentStatus } from '../payments/schemas/payment.schema';
import {
  CompleteDeliveryDto,
  DeliveryLocationDto,
  FailDeliveryDto,
  RejectAssignmentDto,
  ShipperJobsView,
} from './dto/shipper-order.dto';
import { UserRole } from '../users/user-role.enum';
import { canTransitionDeliveryState } from './delivery-state.machine';
import { Cron } from '@nestjs/schedule';
import {
  canVehicleCarry,
  DispatchCandidate,
  DispatchVehicleLimits,
  rankDispatchCandidates,
} from './shipper-dispatch.policy';

type BranchResolution = {
  branchId: Types.ObjectId;
  source: BranchAssignmentSource;
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private trackingModel: any;
  private readonly genOtp = () =>
    randomInt(0, 1_000_000).toString().padStart(6, '0');
  private readonly genOtpToken = () => randomBytes(24).toString('base64url');
  private expiringAssignments = false;
  private autoDispatchRunning = false;

  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Address.name)
    private readonly addressModel: Model<AddressDocument>,
    @InjectModel(Commune.name)
    private readonly communeModel: Model<CommuneDocument>,
    @InjectModel(Province.name)
    private readonly provinceModel: Model<ProvinceDocument>,
    @InjectModel(Branch.name)
    private readonly branchModel: Model<BranchDocument>,
    @InjectModel(PublicOrderOtp.name)
    private readonly publicOrderOtpModel: Model<PublicOrderOtpDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectConnection() private connection: Connection,
    private pricingService: PricingService,
    private paymentsService: PaymentsService,
    private mailService: MailService,
    private configService: ConfigService,
    private notificationsService: NotificationsService,
  ) {
    this.trackingModel = this.connection.model(Tracking.name);
  }

  private normalizeEmail(email: string) {
    return (email || '').trim().toLowerCase();
  }

  private normalizePhone(phone: string) {
    return (phone || '').replace(/\s+/g, '').trim();
  }

  private escapeRegex(value: unknown) {
    return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private normalizeLocationName(value: unknown): string {
    return String(value ?? '')
      .normalize('NFC')
      .trim()
      .toLocaleLowerCase('vi-VN')
      .replace(
        /^(tỉnh|thành phố|tp\.?|quận|huyện|thị xã|phường|xã|thị trấn)\s+/u,
        '',
      )
      .replace(/[.,-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private hashOtpSecret(value: string): string {
    return createHmac(
      'sha256',
      this.configService.get<string>('JWT_ACCESS_TOKEN_SECRET'),
    )
      .update(value)
      .digest('hex');
  }

  async requestPublicOtp(phoneRaw: string, emailRaw: string) {
    const phone = this.normalizePhone(phoneRaw);
    const email = this.normalizeEmail(emailRaw);
    if (!/^[0-9]{9,11}$/.test(phone)) {
      throw new BadRequestException('Số điện thoại không hợp lệ');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Email nhận OTP không hợp lệ');
    }

    const cooldownSeconds = Number(
      this.configService.get<string>('B2C_OTP_COOLDOWN_SECONDS', '60'),
    );
    const maxPerWindow = Number(
      this.configService.get<string>('B2C_OTP_MAX_PER_30M', '5'),
    );
    const now = dayjs();

    const recentOtp = await this.publicOrderOtpModel
      .findOne({
        $or: [{ phone }, { email }],
        createdAt: { $gte: now.subtract(cooldownSeconds, 'second').toDate() },
      })
      .sort({ createdAt: -1 })
      .lean();
    if (recentOtp) {
      throw new BadRequestException(
        `Vui lòng chờ ${cooldownSeconds} giây trước khi gửi lại OTP`,
      );
    }

    const sentCountInWindow = await this.publicOrderOtpModel.countDocuments({
      $or: [{ phone }, { email }],
      createdAt: { $gte: now.subtract(30, 'minute').toDate() },
    });
    if (sentCountInWindow >= maxPerWindow) {
      throw new BadRequestException(
        'Bạn đã vượt quá số lần gửi OTP. Vui lòng thử lại sau 30 phút.',
      );
    }

    const rawToken = this.genOtpToken();
    const rawCode = this.genOtp();
    const otpRecord = await this.publicOrderOtpModel.create({
      phone,
      email,
      code: this.hashOtpSecret(rawCode),
      token: this.hashOtpSecret(rawToken),
      expiresAt: dayjs().add(5, 'minute').toDate(),
    });

    const mailConfigured = this.mailService.isConfigured();
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';
    let delivered = false;

    if (mailConfigured) {
      delivered = await this.mailService.send(
        email,
        'Mã xác thực tạo đơn | AP Post',
        `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#163300">
          <h2>Mã xác thực AP Post</h2>
          <p>Mã OTP tạo đơn của bạn là:</p>
          <p style="font-size:28px;font-weight:700;letter-spacing:6px">${rawCode}</p>
          <p>Mã có hiệu lực trong 5 phút và chỉ dùng được một lần.</p>
          <p>Nếu bạn không yêu cầu mã này, hãy bỏ qua email.</p>
        </div>`,
      );
    }

    if (isProduction && !delivered) {
      await this.publicOrderOtpModel.deleteOne({ _id: otpRecord._id });
      throw new ServiceUnavailableException(
        'Không thể gửi email OTP. Vui lòng thử lại sau.',
      );
    }

    return {
      otpToken: rawToken,
      expiresInSeconds: 300,
      devOtpCode: isProduction ? undefined : rawCode,
      delivery: delivered ? 'email' : 'development',
      message: delivered
        ? `OTP đã được gửi đến ${email}.`
        : 'OTP development đã được tạo.',
    };
  }

  async verifyPublicOtp(phoneRaw: string, emailRaw: string, codeRaw: string) {
    const phone = this.normalizePhone(phoneRaw);
    const email = this.normalizeEmail(emailRaw);
    const code = (codeRaw || '').trim();

    const otpRecord = await this.publicOrderOtpModel
      .findOne({
        phone,
        email,
        usedAt: null,
      })
      .sort({ createdAt: -1 });

    if (!otpRecord) {
      throw new BadRequestException('Không tìm thấy phiên OTP hợp lệ');
    }

    if (dayjs().isAfter(otpRecord.expiresAt)) {
      throw new BadRequestException('OTP đã hết hạn');
    }

    if (otpRecord.attempts >= 5) {
      throw new BadRequestException('Bạn đã nhập sai OTP quá nhiều lần');
    }

    if (otpRecord.code !== this.hashOtpSecret(code)) {
      otpRecord.attempts += 1;
      await otpRecord.save();
      throw new BadRequestException('OTP không đúng');
    }

    otpRecord.verifiedAt = new Date();
    await otpRecord.save();

    return {
      verified: true,
      message: 'Xác thực OTP thành công',
    };
  }

  private async consumeVerifiedPublicOtp(
    phoneRaw: string,
    otpToken?: string,
  ): Promise<PublicOrderOtpDocument> {
    const phone = this.normalizePhone(phoneRaw);
    if (!otpToken) {
      throw new BadRequestException('Thiếu OTP token cho đơn B2C');
    }

    const otpRecord = await this.publicOrderOtpModel.findOneAndUpdate(
      {
        token: this.hashOtpSecret(otpToken),
        phone,
        usedAt: null,
        verifiedAt: { $ne: null },
        expiresAt: { $gt: new Date() },
      },
      { $set: { usedAt: new Date() } },
      { new: true },
    );
    if (!otpRecord) {
      throw new BadRequestException(
        'OTP token không hợp lệ, đã dùng hoặc hết hạn',
      );
    }
    return otpRecord;
  }

  private async resolveBranchForPickup(
    pickupProvinceId: string,
    pickupCommuneId?: string,
    fallbackBranchId?: string | Types.ObjectId | null,
    fallbackSource: BranchAssignmentSource = BranchAssignmentSource.MANUAL_SHIPPER_BRANCH,
  ): Promise<BranchResolution | null> {
    const [commune, province, activeBranches] = await Promise.all([
      pickupCommuneId
        ? this.communeModel.findById(pickupCommuneId).lean()
        : Promise.resolve(null),
      this.provinceModel.findById(pickupProvinceId).lean(),
      this.branchModel
        .find({ isDeleted: false, isActive: true })
        .select('_id provinceName communeName')
        .sort({ createdAt: 1 })
        .lean(),
    ]);
    const communeName = this.normalizeLocationName(commune?.name);
    const provinceName = this.normalizeLocationName(province?.name);
    const addressBranch =
      (communeName
        ? activeBranches.find(
            (branch) =>
              this.normalizeLocationName(branch.communeName) === communeName,
          )
        : undefined) ??
      (provinceName
        ? activeBranches.find(
            (branch) =>
              this.normalizeLocationName(branch.provinceName) === provinceName,
          )
        : undefined);
    if (addressBranch?._id) {
      return {
        branchId: new Types.ObjectId(addressBranch._id),
        source: BranchAssignmentSource.ADDRESS,
      };
    }

    if (fallbackBranchId && Types.ObjectId.isValid(String(fallbackBranchId))) {
      const fallbackBranch = activeBranches.find(
        (branch) => String(branch._id) === String(fallbackBranchId),
      );
      if (fallbackBranch?._id) {
        return {
          branchId: new Types.ObjectId(fallbackBranch._id),
          source: fallbackSource,
        };
      }
    }

    if (activeBranches.length === 1) {
      return {
        branchId: new Types.ObjectId(activeBranches[0]._id),
        source: BranchAssignmentSource.SINGLE_ACTIVE_BRANCH,
      };
    }

    return null;
  }

  private getDefaultAssignmentMode(): AssignmentMode {
    return String(
      this.configService.get<string>('SHIPPER_DISPATCH_MODE', 'MANUAL'),
    ).toUpperCase() === AssignmentMode.AUTO
      ? AssignmentMode.AUTO
      : AssignmentMode.MANUAL;
  }

  // ====================== TẠO ĐƠN HÀNG (ĐÃ TỐI ƯU) ======================
  async create(dto: CreateOrderDto, user: IUser) {
    const existing = await this.findIdempotentOrder(dto, user);
    if (existing) return existing;
    const waybill = await this.generateUniqueWaybill();

    const originProv = await this.provinceModel
      .findById(dto.pickupAddress.provinceId)
      .lean();
    const destProv = await this.provinceModel
      .findById(dto.deliveryAddress.provinceId)
      .lean();

    if (!originProv?.code || !destProv?.code) {
      throw new BadRequestException('Tỉnh/thành phố không hợp lệ');
    }

    const calcResult = await this.pricingService.calculateShipping(
      originProv.code as ProvinceCode,
      destProv.code as ProvinceCode,
      dto.serviceCode || 'STD',
      dto.weightKg,
      originProv.code === destProv.code,
    );

    const activePricing =
      await this.pricingService.getActivePricingByServiceCode(
        dto.serviceCode || 'STD',
      );

    const shippingFee = Number(calcResult.totalPrice) || 0;
    const isOnlinePayment = ONLINE_PAYMENT_METHODS.includes(
      dto.paymentMethod as never,
    );
    // Gateway payments are made by the person creating the order. Normalize
    // this server-side too, so API clients cannot create a zero-value payment.
    const shippingFeePayer = isOnlinePayment
      ? 'SENDER'
      : dto.shippingFeePayer || 'SENDER';
    const codValue = Number(dto.codValue) || 0;

    let senderPayAmount = shippingFeePayer === 'SENDER' ? shippingFee : 0;
    let receiverPayAmount =
      codValue + (shippingFeePayer === 'RECEIVER' ? shippingFee : 0);

    if (isOnlinePayment) {
      senderPayAmount += codValue;
      receiverPayAmount = 0;
    }

    const totalOrderValue = codValue + shippingFee;

    const [pickupAddr, deliveryAddr] = await Promise.all([
      this.addressModel.create(dto.pickupAddress),
      this.addressModel.create(dto.deliveryAddress),
    ]);

    let branchResolution: BranchResolution | null = null;
    const rawBranchId = user.branchId ?? (user as any).branchId ?? null;

    if (user.role === 'STAFF') {
      if (!rawBranchId)
        throw new BadRequestException('Nhân viên chưa được gắn bưu cục.');
      branchResolution = {
        branchId: new Types.ObjectId(rawBranchId),
        source: BranchAssignmentSource.STAFF_PROFILE,
      };
    } else {
      branchResolution = await this.resolveBranchForPickup(
        dto.pickupAddress.provinceId,
        dto.pickupAddress.communeId,
        rawBranchId,
      );
    }

    const newOrder = await this.orderModel.create({
      ...dto,
      pickupAddressId: pickupAddr._id,
      deliveryAddressId: deliveryAddr._id,
      userId: new Types.ObjectId(user._id),
      branchId: branchResolution?.branchId ?? null,
      branchAssignmentSource: branchResolution?.source,
      branchAssignedAt: branchResolution ? new Date() : undefined,
      codValue,
      details: dto.details || null,
      shippingFee,
      totalPrice: totalOrderValue,
      serviceCode: dto.serviceCode || 'STD',
      weightKg: dto.weightKg,
      waybill,
      shippingFeePayer,
      senderPayAmount,
      receiverPayAmount,
      totalOrderValue,
      snapshotPricingId: activePricing._id,
      snapshotBasePrice: activePricing.basePrice,
      snapshotOverweightFee: calcResult.breakdown.overweightFee || 0,
      snapshotRegionFee: calcResult.breakdown.regionFee || 0,
      snapshotIsLocal: calcResult.breakdown.isLocal,
      snapshotServiceCode: dto.serviceCode || 'STD',
      snapshotWeightKg: dto.weightKg,
      snapshotBreakdown: calcResult.breakdown,
      status: OrderStatus.PENDING,
      createdBy: { _id: new Types.ObjectId(user._id), email: user.email },
      paymentMethod: dto.paymentMethod || PaymentMethod.CASH,
      channel:
        user.role === 'STAFF' ? OrderChannel.B2B_STAFF : OrderChannel.B2C_USER,
      assignmentMode: this.getDefaultAssignmentMode(),
      clientRequestId: dto.clientRequestId,
    });

    await this.trackingModel.create({
      orderId: newOrder._id,
      status: OrderStatus.PENDING,
      timestamp: new Date(),
      location: originProv?.name || 'Khách hàng mang đến bưu cục',
      note: `Đơn hàng được tạo. Người gửi trả: ${senderPayAmount.toLocaleString(
        'vi-VN',
      )}₫ | Người nhận trả: ${receiverPayAmount.toLocaleString('vi-VN')}₫`,
      createdBy: { _id: user._id, email: user.email },
      branchId: newOrder.branchId || null,
    });

    const customerEmail = this.normalizeEmail(dto.email);
    if (customerEmail && !isOnlinePayment) {
      this.mailService
        .sendOrderConfirmation({
          to: customerEmail,
          receiverName: dto.receiverName,
          waybill: newOrder.waybill,
          shippingFee,
          codValue,
          senderPayAmount,
          receiverPayAmount,
          totalOrderValue,
          shippingFeePayer,
        })
        .catch((err) =>
          this.logger.warn(`Gửi email xác nhận thất bại: ${err.message}`),
        );
    }

    // TẠO PAYMENT
    const payment = await this.paymentsService.createPaymentForOrder(
      newOrder._id.toString(),
      {
        method: dto.paymentMethod || PaymentMethod.CASH,
        amount: senderPayAmount,
        status: PaymentStatus.PENDING,
        createdBy: { _id: user._id, email: user.email },
      },
    );

    // Emit a notification to the customer if possible
    try {
      let recipient: string | null = null;

      const emailNorm = this.normalizeEmail(dto.email);
      const receiverPhoneNorm = this.normalizePhone(dto.receiverPhone);
      const senderPhoneNorm = this.normalizePhone(dto.senderPhone);

      if (emailNorm) {
        const found = await this.userModel
          .findOne({ email: emailNorm, isDeleted: false })
          .lean();
        if (found && found._id) recipient = String(found._id);
      }

      if (!recipient && receiverPhoneNorm) {
        const foundByPhone = await this.userModel
          .findOne({ phone: receiverPhoneNorm, isDeleted: false })
          .lean();
        if (foundByPhone && foundByPhone._id)
          recipient = String(foundByPhone._id);
      }

      if (!recipient && senderPhoneNorm) {
        const foundByPhone = await this.userModel
          .findOne({ phone: senderPhoneNorm, isDeleted: false })
          .lean();
        if (foundByPhone && foundByPhone._id)
          recipient = String(foundByPhone._id);
      }

      // If we couldn't resolve to a user id, fallback to email (will broadcast)
      const notifyRecipient = recipient || (emailNorm ? emailNorm : null);

      if (notifyRecipient) {
        await this.notificationsService.create({
          recipient: notifyRecipient,
          title: `Đơn ${newOrder.waybill} đã tạo`,
          message: `Đơn ${newOrder.waybill} được tạo thành công. Vui lòng theo dõi trạng thái.`,
          type: NotificationType.PUSH,
        } as any);
      }
      // Notify operational staff (role:STAFF) so employees see new incoming orders in real-time
      try {
        await this.notificationsService.create({
          recipient: 'role:staff',
          title: `Đơn mới ${newOrder.waybill}`,
          message: `Có đơn mới ${newOrder.waybill} cần xử lý.`,
          type: NotificationType.PUSH,
        } as any);
      } catch {
        // ignore
      }
    } catch (err) {
      this.logger.warn(
        'Failed to create/send order notification:',
        err?.message || err,
      );
    }

    return {
      order: newOrder,
      payment,
    };
  }

  async createPublic(dto: CreateOrderDto) {
    if (!dto.senderPhone) {
      throw new BadRequestException('Đơn B2C cần số điện thoại người gửi');
    }
    const existing = await this.findIdempotentOrder(dto);
    if (existing) return existing;
    await this.consumeVerifiedPublicOtp(dto.senderPhone, dto.publicOtpToken);

    const waybill = await this.generateUniqueWaybill();

    const originProv = await this.provinceModel
      .findById(dto.pickupAddress.provinceId)
      .lean();
    const destProv = await this.provinceModel
      .findById(dto.deliveryAddress.provinceId)
      .lean();

    if (!originProv?.code || !destProv?.code) {
      throw new BadRequestException('Tỉnh/thành phố không hợp lệ');
    }

    const calcResult = await this.pricingService.calculateShipping(
      originProv.code as ProvinceCode,
      destProv.code as ProvinceCode,
      dto.serviceCode || 'STD',
      dto.weightKg,
      originProv.code === destProv.code,
    );

    const activePricing =
      await this.pricingService.getActivePricingByServiceCode(
        dto.serviceCode || 'STD',
      );

    const shippingFee = Number(calcResult.totalPrice) || 0;
    const isOnlinePayment = ONLINE_PAYMENT_METHODS.includes(
      dto.paymentMethod as never,
    );
    const shippingFeePayer = isOnlinePayment
      ? 'SENDER'
      : dto.shippingFeePayer || 'SENDER';
    const codValue = Number(dto.codValue) || 0;

    let senderPayAmount = shippingFeePayer === 'SENDER' ? shippingFee : 0;
    let receiverPayAmount =
      codValue + (shippingFeePayer === 'RECEIVER' ? shippingFee : 0);

    if (isOnlinePayment) {
      senderPayAmount += codValue;
      receiverPayAmount = 0;
    }

    const totalOrderValue = codValue + shippingFee;
    const [pickupAddr, deliveryAddr] = await Promise.all([
      this.addressModel.create(dto.pickupAddress),
      this.addressModel.create(dto.deliveryAddress),
    ]);

    const branchResolution = await this.resolveBranchForPickup(
      dto.pickupAddress.provinceId,
      dto.pickupAddress.communeId,
    );

    const newOrder = await this.orderModel.create({
      ...dto,
      pickupAddressId: pickupAddr._id,
      deliveryAddressId: deliveryAddr._id,
      userId: null,
      branchId: branchResolution?.branchId ?? null,
      branchAssignmentSource: branchResolution?.source,
      branchAssignedAt: branchResolution ? new Date() : undefined,
      codValue,
      details: dto.details || null,
      shippingFee,
      totalPrice: totalOrderValue,
      serviceCode: dto.serviceCode || 'STD',
      weightKg: dto.weightKg,
      waybill,
      shippingFeePayer,
      senderPayAmount,
      receiverPayAmount,
      totalOrderValue,
      snapshotPricingId: activePricing._id,
      snapshotBasePrice: activePricing.basePrice,
      snapshotOverweightFee: calcResult.breakdown.overweightFee || 0,
      snapshotRegionFee: calcResult.breakdown.regionFee || 0,
      snapshotIsLocal: calcResult.breakdown.isLocal,
      snapshotServiceCode: dto.serviceCode || 'STD',
      snapshotWeightKg: dto.weightKg,
      snapshotBreakdown: calcResult.breakdown,
      status: OrderStatus.PENDING,
      createdBy: null,
      paymentMethod: dto.paymentMethod || PaymentMethod.CASH,
      channel: OrderChannel.B2C_GUEST,
      senderPhone: this.normalizePhone(dto.senderPhone),
      pickupMethod: dto.pickupMethod || 'DROPOFF',
      pickupSlot: dto.pickupSlot ? new Date(dto.pickupSlot) : null,
      assignmentMode: this.getDefaultAssignmentMode(),
      clientRequestId: dto.clientRequestId,
    });

    await this.trackingModel.create({
      orderId: newOrder._id,
      status: OrderStatus.PENDING,
      timestamp: new Date(),
      location: originProv?.name || 'Khách lẻ tạo đơn trực tuyến',
      note: `Đơn B2C được tạo. Người gửi trả: ${senderPayAmount.toLocaleString(
        'vi-VN',
      )}₫ | Người nhận trả: ${receiverPayAmount.toLocaleString(
        'vi-VN',
      )}₫ | Hình thức: ${dto.pickupMethod || 'DROPOFF'}`,
      createdBy: null,
      branchId: branchResolution?.branchId ?? null,
    });

    const customerEmail = this.normalizeEmail(dto.email);
    if (customerEmail && !isOnlinePayment) {
      this.mailService
        .sendOrderConfirmation({
          to: customerEmail,
          receiverName: dto.receiverName,
          waybill: newOrder.waybill,
          shippingFee,
          codValue,
          senderPayAmount,
          receiverPayAmount,
          totalOrderValue,
          shippingFeePayer,
        })
        .catch((err) =>
          this.logger.warn(`Gửi email xác nhận B2C thất bại: ${err.message}`),
        );
    }

    const payment = await this.paymentsService.createPaymentForOrder(
      newOrder._id.toString(),
      {
        method: dto.paymentMethod || PaymentMethod.CASH,
        amount: senderPayAmount,
        status: PaymentStatus.PENDING,
        createdBy: null,
      },
    );

    // Emit notification for guest/public order if possible (resolve to user id by email/phone)
    try {
      let recipient: string | null = null;

      const emailNorm = this.normalizeEmail(dto.email);
      const receiverPhoneNorm = this.normalizePhone(dto.receiverPhone);
      const senderPhoneNorm = this.normalizePhone(dto.senderPhone);

      if (emailNorm) {
        const found = await this.userModel
          .findOne({ email: emailNorm, isDeleted: false })
          .lean();
        if (found && found._id) recipient = String(found._id);
      }

      if (!recipient && receiverPhoneNorm) {
        const foundByPhone = await this.userModel
          .findOne({ phone: receiverPhoneNorm, isDeleted: false })
          .lean();
        if (foundByPhone && foundByPhone._id)
          recipient = String(foundByPhone._id);
      }

      if (!recipient && senderPhoneNorm) {
        const foundByPhone = await this.userModel
          .findOne({ phone: senderPhoneNorm, isDeleted: false })
          .lean();
        if (foundByPhone && foundByPhone._id)
          recipient = String(foundByPhone._id);
      }

      const notifyRecipient = recipient || (emailNorm ? emailNorm : null);
      if (notifyRecipient) {
        await this.notificationsService.create({
          recipient: notifyRecipient,
          title: `Đơn ${newOrder.waybill} đã tạo`,
          message: `Đơn ${newOrder.waybill} được tạo thành công. Vui lòng theo dõi trạng thái.`,
          type: NotificationType.PUSH,
        } as any);
      }
      // Notify operational staff (role:STAFF) about public/guest order
      try {
        await this.notificationsService.create({
          recipient: 'role:staff',
          title: `Đơn mới ${newOrder.waybill}`,
          message: `Đơn B2C ${newOrder.waybill} được tạo bởi khách lẻ. Vui lòng kiểm tra.`,
          type: NotificationType.PUSH,
        } as any);
      } catch {}
    } catch (err) {
      this.logger.warn(
        'Failed to create/send public order notification:',
        err?.message || err,
      );
    }

    return {
      order: newOrder,
      payment,
    };
  }

  private async generateUniqueWaybill(): Promise<string> {
    let waybill: string;
    let exists: boolean;

    do {
      const prefix = 'BD';
      const numbers = Math.floor(100000000 + Math.random() * 900000000);
      const suffix = 'VN';
      waybill = `${prefix}${numbers}${suffix}`;

      const found = await this.orderModel.findOne({ waybill });
      exists = !!found;
    } while (exists);

    return waybill;
  }

  async findAll(user: IUser, currentPage = 1, limit = 10, queryObj: any = {}) {
    const { filter, sort } = aqp(queryObj);

    delete (filter as any).current;
    delete (filter as any).pageSize;
    filter.isDeleted = false;

    if (user.role === 'USER') {
      filter.userId = new Types.ObjectId(user._id);
    } else if (user.role === 'STAFF') {
      const branchId = user.branchId ?? user.BranchId;
      if (!branchId) {
        throw new ForbiddenException('Staff account has no assigned branch');
      }
      delete filter.userId;
      filter.branchId = new Types.ObjectId(String(branchId));
    } else if (user.role === UserRole.SHIPPER) {
      delete filter.userId;
      filter.assignedShipperId = new Types.ObjectId(user._id);
    }
    if (filter.userId) {
      filter.userId = new Types.ObjectId(filter.userId);
    }

    // --- Filter nâng cao ---
    if (filter.status) {
      if (typeof filter.status === 'string' && filter.status.includes(',')) {
        filter.status = { $in: filter.status.split(',') };
      }
    }
    if (filter.fromDate || filter.toDate) {
      filter.createdAt = {};
      if (filter.fromDate) filter.createdAt.$gte = new Date(filter.fromDate);
      if (filter.toDate) filter.createdAt.$lte = new Date(filter.toDate);
    }
    if (filter.minPrice || filter.maxPrice) {
      filter.totalPrice = {};
      if (filter.minPrice) filter.totalPrice.$gte = Number(filter.minPrice);
      if (filter.maxPrice) filter.totalPrice.$lte = Number(filter.maxPrice);
    }
    if (filter.senderName)
      filter.senderName = new RegExp(this.escapeRegex(filter.senderName), 'i');
    if (filter.receiverName)
      filter.receiverName = new RegExp(
        this.escapeRegex(filter.receiverName),
        'i',
      );
    if (filter.receiverPhone)
      filter.receiverPhone = new RegExp(
        this.escapeRegex(filter.receiverPhone),
        'i',
      );
    if (filter.productName)
      filter['items.productName'] = new RegExp(
        this.escapeRegex(filter.productName),
        'i',
      );
    if (filter.search) {
      const regex = new RegExp(this.escapeRegex(filter.search), 'i');
      filter.$or = [
        { waybill: regex },
        { receiverName: regex },
        { receiverPhone: regex },
        { senderName: regex },
        { 'items.productName': regex },
      ];
    }

    const page = Number(currentPage) > 0 ? Number(currentPage) : 1;
    const size = Math.min(Number(limit) > 0 ? Number(limit) : 10, 100);
    const skip = (page - 1) * size;

    const total = await this.orderModel.countDocuments(filter);
    const pages = Math.ceil(total / size);

    const results = await this.orderModel
      .find(filter)
      .sort((sort as any) || { createdAt: -1 })
      .skip(skip)
      .limit(size)
      .populate({
        path: 'pickupAddressId',
        model: Address.name,
        populate: [
          { path: 'provinceId', model: Province.name },
          { path: 'communeId', model: Commune.name },
        ],
      })
      .populate({
        path: 'deliveryAddressId',
        model: Address.name,
        populate: [
          { path: 'provinceId', model: Province.name },
          { path: 'communeId', model: Commune.name },
        ],
      })
      .populate('assignedShipperId', 'name phone email')
      .exec();

    return { meta: { current: page, pageSize: size, pages, total }, results };
  }

  async findOne(id: string, user?: IUser) {
    const order = await this.orderModel
      .findById(id)
      .populate({
        path: 'pickupAddressId',
        populate: [
          { path: 'provinceId', model: 'Province' },
          { path: 'communeId', model: 'Commune' },
        ],
      })
      .populate({
        path: 'deliveryAddressId',
        populate: [
          { path: 'provinceId', model: 'Province' },
          { path: 'communeId', model: 'Commune' },
        ],
      })
      .populate('assignedShipperId', 'name phone email avatarUrl')
      .populate('branchId', 'name address phone')
      .lean();

    if (!order || order.isDeleted) {
      throw new NotFoundException('Order not found');
    }

    if (user) this.assertCanAccessOrder(order, user);

    const hasSnapshot = !!order.snapshotPricingId;
    const response: any = {
      ...order,
      pricingLocked: hasSnapshot,
      snapshotShippingFee: order.shippingFee,
      pricingNote: hasSnapshot
        ? 'Phí vận chuyển đã được cố định từ lúc khách đặt hàng'
        : 'Có thể điều chỉnh phí',
    };

    return response;
  }

  async update(id: string, dto: UpdateOrderDto, user: IUser) {
    const order = await this.orderModel.findById(id);
    if (!order || order.isDeleted) {
      throw new NotFoundException('Order not found');
    }

    this.assertCanAccessOrder(order, user);
    const editedFields = Object.entries(dto).filter(
      ([key, value]) => key !== 'status' && value !== undefined,
    );
    if (dto.status && dto.status !== order.status) {
      if (!['ADMIN', 'STAFF'].includes(user.role)) {
        throw new ForbiddenException('Only staff can update order status');
      }
      if (editedFields.length > 0) {
        throw new BadRequestException(
          'Không thể vừa sửa nội dung đơn vừa chuyển trạng thái trong cùng một yêu cầu',
        );
      }
      return this.updateStatus(id, dto.status, user);
    }
    if (order.status !== OrderStatus.PENDING) {
      throw new ForbiddenException(
        'Chỉ đơn đang chờ xác nhận mới được sửa thông tin',
      );
    }

    let needRecalculateFee = false;
    let newShippingFee = order.shippingFee;

    if (
      dto.pickupAddress?.provinceId ||
      dto.deliveryAddress?.provinceId ||
      dto.serviceCode ||
      dto.weightKg !== undefined
    ) {
      needRecalculateFee = true;
    }

    if (needRecalculateFee) {
      const pickupProvinceId =
        dto.pickupAddress?.provinceId ||
        (await this.addressModel.findById(order.pickupAddressId).lean())
          ?.provinceId;
      const deliveryProvinceId =
        dto.deliveryAddress?.provinceId ||
        (await this.addressModel.findById(order.deliveryAddressId).lean())
          ?.provinceId;

      const originProv = await this.provinceModel
        .findById(pickupProvinceId)
        .lean();
      const destProv = await this.provinceModel
        .findById(deliveryProvinceId)
        .lean();

      if (!originProv?.code || !destProv?.code) {
        newShippingFee = 0;
      } else {
        const calcResult = await this.pricingService.calculateShipping(
          originProv.code as ProvinceCode,
          destProv.code as ProvinceCode,
          dto.serviceCode || order.serviceCode || 'STD',
          dto.weightKg || order.weightKg || 1,
          originProv.code === destProv.code,
        );
        newShippingFee =
          typeof calcResult.totalPrice === 'number' ? calcResult.totalPrice : 0;
      }
    }

    if (dto.pickupAddress) {
      await this.addressModel.findByIdAndUpdate(order.pickupAddressId, {
        provinceId: dto.pickupAddress.provinceId,
        communeId: dto.pickupAddress.communeId,
        address: dto.pickupAddress.address,
        lat: dto.pickupAddress.lat || null,
        lng: dto.pickupAddress.lng || null,
      });
    }

    if (dto.deliveryAddress) {
      await this.addressModel.findByIdAndUpdate(order.deliveryAddressId, {
        provinceId: dto.deliveryAddress.provinceId,
        communeId: dto.deliveryAddress.communeId,
        address: dto.deliveryAddress.address,
        lat: dto.deliveryAddress.lat || null,
        lng: dto.deliveryAddress.lng || null,
      });
    }

    const codValue = dto.codValue ?? order.codValue ?? 0;
    const paymentMethod =
      dto.paymentMethod ?? order.paymentMethod ?? PaymentMethod.CASH;
    const isOnlinePayment = ONLINE_PAYMENT_METHODS.includes(
      paymentMethod as never,
    );
    const shippingFeePayer = isOnlinePayment
      ? 'SENDER'
      : (dto.shippingFeePayer ?? order.shippingFeePayer ?? 'SENDER');
    let senderPayAmount = shippingFeePayer === 'SENDER' ? newShippingFee : 0;
    let receiverPayAmount =
      codValue + (shippingFeePayer === 'RECEIVER' ? newShippingFee : 0);
    if (isOnlinePayment) {
      senderPayAmount += codValue;
      receiverPayAmount = 0;
    }
    const totalOrderValue = codValue + newShippingFee;

    const updateData: any = {
      ...dto,
      codValue,
      shippingFee: newShippingFee,
      shippingFeePayer,
      senderPayAmount,
      receiverPayAmount,
      totalOrderValue,
      totalPrice: totalOrderValue,
    };

    if (dto.pickupAddress && user.role !== UserRole.STAFF) {
      const rawBranchId = user.branchId ?? (user as any).BranchId ?? null;
      const branchResolution = await this.resolveBranchForPickup(
        dto.pickupAddress.provinceId,
        dto.pickupAddress.communeId,
        rawBranchId,
      );
      updateData.branchId = branchResolution?.branchId ?? null;
      updateData.branchAssignmentSource = branchResolution?.source ?? null;
      updateData.branchAssignedAt = branchResolution ? new Date() : null;
    }

    // Lưu email nếu có
    if (dto.email) {
      updateData.email = dto.email.trim().toLowerCase();
    }

    delete updateData.pickupAddress;
    delete updateData.deliveryAddress;

    // Cập nhật thông tin đơn hàng
    const updatedOrder = await this.orderModel
      .findOneAndUpdate({ _id: id, isDeleted: false }, updateData, {
        new: true,
        runValidators: true,
      })
      .populate({
        path: 'pickupAddressId deliveryAddressId',
        populate: { path: 'provinceId communeId' },
      });

    if (!updatedOrder) throw new NotFoundException('Order not found');

    if (
      needRecalculateFee ||
      dto.codValue !== undefined ||
      dto.paymentMethod !== undefined ||
      dto.shippingFeePayer !== undefined
    ) {
      await this.paymentsService.syncPendingPaymentForOrder(id, {
        method: paymentMethod,
        amount: senderPayAmount,
        createdBy: { _id: user._id, email: user.email },
      });
    }

    // === GỬI EMAIL THÔNG BÁO SAU KHI CẬP NHẬT THÀNH CÔNG ===
    if (updatedOrder.email) {
      this.mailService
        .sendOrderConfirmation({
          to: updatedOrder.email,
          receiverName: updatedOrder.receiverName,
          waybill: updatedOrder.waybill,
          shippingFee: updatedOrder.shippingFee,
          codValue: updatedOrder.codValue,
          senderPayAmount: updatedOrder.senderPayAmount || 0,
          receiverPayAmount: updatedOrder.receiverPayAmount || 0,
          totalOrderValue: updatedOrder.totalOrderValue || 0,
          shippingFeePayer: updatedOrder.shippingFeePayer,
        })
        .catch((err) =>
          this.logger.warn(
            `Gửi email cập nhật đơn hàng thất bại: ${err.message}`,
          ),
        );
    }

    return updatedOrder;
  }

  async remove(id: string, user: IUser) {
    const order = await this.orderModel.findById(id);
    if (!order || order.isDeleted)
      throw new NotFoundException('Order not found');

    this.assertCanAccessOrder(order, user);
    if (![OrderStatus.PENDING, OrderStatus.CANCELED].includes(order.status)) {
      throw new ForbiddenException(
        'Chỉ có thể xóa mềm đơn đang chờ xác nhận hoặc đã hủy',
      );
    }

    const result = await this.orderModel.updateOne(
      { _id: id, isDeleted: { $ne: true } },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: {
            _id: new Types.ObjectId(user._id),
            email: user.email,
          },
        },
      },
    );
    if (result.modifiedCount === 0) {
      throw new NotFoundException('Order not found');
    }

    return { message: 'Order soft-deleted' };
  }

  async updateStatus(id: string, status: OrderStatus, user?: IUser) {
    const order = await this.orderModel.findById(id);
    if (!order || order.isDeleted) {
      this.logger.warn(`Order ${id} not found or deleted`);
      throw new NotFoundException('Order not found');
    }

    if (user) this.assertCanAccessOrder(order, user);

    const oldStatus = order.status;
    if (oldStatus === status) return order;

    if ([OrderStatus.SHIPPING, OrderStatus.COMPLETED].includes(status)) {
      throw new BadRequestException(
        'Trạng thái đang giao và hoàn tất chỉ được cập nhật qua luồng tác nghiệp của shipper',
      );
    }

    if (
      status === OrderStatus.CANCELED &&
      [DeliveryState.DELIVERING, DeliveryState.DELIVERED].includes(
        order.deliveryState,
      )
    ) {
      throw new BadRequestException(
        'Không thể hủy đơn đang giao hoặc đã giao. Hãy xử lý theo luồng giao thất bại/hoàn trả.',
      );
    }

    if (
      status === OrderStatus.CONFIRMED &&
      !(await this.paymentsService.hasSuccessfulPayment(id))
    ) {
      throw new BadRequestException(
        'Đơn hàng chỉ được xác nhận sau khi thanh toán thành công',
      );
    }

    const transitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELED],
      [OrderStatus.CONFIRMED]: [OrderStatus.SHIPPING, OrderStatus.CANCELED],
      [OrderStatus.SHIPPING]: [OrderStatus.COMPLETED, OrderStatus.CANCELED],
      [OrderStatus.COMPLETED]: [],
      [OrderStatus.CANCELED]: [],
    };
    if (!transitions[oldStatus]?.includes(status)) {
      throw new BadRequestException(
        `Không thể chuyển trạng thái từ ${oldStatus} sang ${status}`,
      );
    }

    const previousShipperId = order.assignedShipperId
      ? String(order.assignedShipperId)
      : '';
    order.status = status;
    if (status === OrderStatus.CANCELED && order.assignedShipperId) {
      order.assignmentHistory = [
        ...(order.assignmentHistory ?? []),
        {
          shipperId: order.assignedShipperId as Types.ObjectId,
          action: 'UNASSIGNED',
          mode: order.assignmentMode,
          at: new Date(),
          reason: 'Đơn hàng đã bị hủy',
          actorId: user?._id ? new Types.ObjectId(user._id) : undefined,
        },
      ];
      order.assignedShipperId = null;
      order.deliveryState = DeliveryState.UNASSIGNED;
      order.assignmentMode = AssignmentMode.MANUAL;
      order.assignedAt = undefined;
      order.assignmentExpiresAt = undefined;
      order.acceptedAt = undefined;
    }
    order.updatedAt = new Date();

    await order.save();

    if (status === OrderStatus.CANCELED && previousShipperId) {
      await this.notificationsService.dismissOrderNotifications(
        id,
        previousShipperId,
      );
      this.notificationsService.emitUserEvent(
        previousShipperId,
        'assignment:changed',
        { orderId: id, action: 'CANCELED' },
      );
    }

    if (
      status === OrderStatus.CONFIRMED &&
      order.assignmentMode === AssignmentMode.AUTO
    ) {
      this.queueAutomaticAssignment(order);
    }

    this.logger.log(`Order ${id} changed from ${oldStatus} to ${status}`);

    // Tạo tracking
    await this.trackingModel.create({
      orderId: order._id,
      status: status,
      timestamp: new Date(),
      location: order.branchId ? 'Bưu cục xử lý' : 'Hệ thống AP Post',
      note: `Trạng thái chuyển từ ${oldStatus} sang ${status}`,
      createdBy: user
        ? { _id: new Types.ObjectId(user._id), email: user.email }
        : null,
    });

    // Gửi email nếu có
    if (order.email) {
      this.mailService
        .sendStatusUpdate({
          to: order.email.trim(),
          receiverName: order.receiverName || 'Khách hàng',
          waybill: order.waybill,
          status: status,
          trackingUrl: `${this.configService.get<string>(
            'PUBLIC_APP_URL',
            'http://localhost:4200',
          )}/tracking?q=${encodeURIComponent(order.waybill)}`,
          codValue: order.codValue,
        })
        .catch((err) =>
          this.logger.error('Gửi email trạng thái thất bại', err),
        );
    }

    return order;
  }

  async getStatistics(month?: number, year?: number, user?: IUser | null) {
    const filter: any = { isDeleted: false };

    if (user?.role === 'STAFF') {
      const branchId = user.branchId ?? user.BranchId;
      if (!branchId) {
        throw new ForbiddenException('Staff account has no assigned branch');
      }
      filter.branchId = new Types.ObjectId(String(branchId));
    } else if (user?._id) {
      filter.userId = new Types.ObjectId(user._id);
    }

    if (year) {
      const start = new Date(year, month ? month - 1 : 0, 1);
      const end = new Date(year, month ? month : 12, 0, 23, 59, 59, 999);
      filter.createdAt = { $gte: start, $lte: end };
    }

    const orders = await this.orderModel.find(filter).lean();

    const statusKeys = Object.values(OrderStatus);
    const statusCounts: Record<OrderStatus, number> = statusKeys.reduce(
      (acc, k) => {
        acc[k as OrderStatus] = 0;
        return acc;
      },
      {} as Record<OrderStatus, number>,
    );

    let totalOrders = 0;
    let estimatedRevenue = 0;

    for (const o of orders) {
      const st = o.status as OrderStatus;
      if (st && statusCounts[st] !== undefined) statusCounts[st]++;
      totalOrders++;
      if (st === OrderStatus.COMPLETED)
        estimatedRevenue += Number((o as any).totalPrice || 0);
    }

    const initDayBucket = () =>
      statusKeys.reduce(
        (acc, k) => {
          (acc as any)[k] = 0;
          return acc;
        },
        {} as Record<OrderStatus, number>,
      );

    const ordersByDay = {
      T2: initDayBucket(),
      T3: initDayBucket(),
      T4: initDayBucket(),
      T5: initDayBucket(),
      T6: initDayBucket(),
      T7: initDayBucket(),
      CN: initDayBucket(),
    };

    for (const o of orders) {
      const created = new Date((o as any).createdAt);
      const day = created.getDay();
      const key = (
        day === 0 ? 'CN' : `T${day + 1}`
      ) as keyof typeof ordersByDay;
      const st = o.status as OrderStatus;
      (ordersByDay[key] as any)[st] = ((ordersByDay[key] as any)[st] || 0) + 1;
    }

    const productCount: Record<string, number> = {};
    for (const o of orders) {
      if (!(o as any).items) continue;
      for (const it of (o as any).items) {
        productCount[it.productName] =
          (productCount[it.productName] || 0) + it.quantity;
      }
    }
    const topProducts = Object.entries(productCount)
      .map(([name, quantity]) => ({ name, quantity }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    return {
      totalOrders,
      estimatedRevenue,
      statusCounts,
      statusDistribution: statusCounts,
      ordersByDay,
      delivered: statusCounts[OrderStatus.COMPLETED],
      returned: statusCounts[OrderStatus.CANCELED],
      topProducts,
    };
  }

  private assertCanAccessOrder(order: any, user: IUser): void {
    if (user.role === 'ADMIN') return;

    const userId = String(user._id);
    const ownsOrder =
      String(order.userId ?? '') === userId ||
      String(order.createdBy?._id ?? '') === userId;
    const sameBranch =
      user.role === 'STAFF' &&
      user.branchId &&
      String(order.branchId?._id ?? order.branchId ?? '') ===
        String(user.branchId);
    const assignedShipper =
      user.role === UserRole.SHIPPER &&
      String(order.assignedShipperId?._id ?? order.assignedShipperId ?? '') ===
        userId;

    if (!ownsOrder && !sameBranch && !assignedShipper) {
      throw new ForbiddenException('You do not have access to this order');
    }
  }

  async getShipperJobs(
    user: IUser,
    currentPage = 1,
    limit = 20,
    view: ShipperJobsView = ShipperJobsView.ACTIVE,
    search = '',
  ) {
    const page = Math.max(Number(currentPage) || 1, 1);
    const size = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const filter: any = {
      assignedShipperId: new Types.ObjectId(user._id),
      isDeleted: false,
    };

    if (view === ShipperJobsView.HISTORY) {
      filter.status = { $in: [OrderStatus.COMPLETED, OrderStatus.CANCELED] };
    } else if (view === ShipperJobsView.FAILED) {
      filter.deliveryState = DeliveryState.FAILED;
    } else if (view === ShipperJobsView.ASSIGNED) {
      filter.deliveryState = {
        $in: [DeliveryState.ASSIGNED, DeliveryState.ACCEPTED],
      };
    } else if (view !== ShipperJobsView.ALL) {
      filter.status = { $in: [OrderStatus.CONFIRMED, OrderStatus.SHIPPING] };
    }

    const normalizedSearch = String(search ?? '')
      .trim()
      .slice(0, 100);
    if (normalizedSearch) {
      const regex = new RegExp(this.escapeRegex(normalizedSearch), 'i');
      filter.$or = [
        { waybill: regex },
        { receiverName: regex },
        { receiverPhone: regex },
        { senderName: regex },
      ];
    }

    const [total, results] = await Promise.all([
      this.orderModel.countDocuments(filter),
      this.orderModel
        .find(filter)
        .sort({ assignedAt: -1, createdAt: -1 })
        .skip((page - 1) * size)
        .limit(size)
        .populate({
          path: 'pickupAddressId deliveryAddressId',
          populate: { path: 'provinceId communeId' },
        })
        .populate('branchId', 'name address phone')
        .lean(),
    ]);

    return {
      meta: {
        current: page,
        pageSize: size,
        pages: Math.ceil(total / size),
        total,
      },
      results,
    };
  }

  async getShipperSummary(user: IUser) {
    const assignedShipperId = new Types.ObjectId(user._id);
    const base = { assignedShipperId, isDeleted: false };
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [
      assigned,
      delivering,
      failed,
      completedToday,
      totalCompleted,
      codSummary,
    ] = await Promise.all([
      this.orderModel.countDocuments({
        ...base,
        deliveryState: {
          $in: [DeliveryState.ASSIGNED, DeliveryState.ACCEPTED],
        },
      }),
      this.orderModel.countDocuments({
        ...base,
        deliveryState: DeliveryState.DELIVERING,
      }),
      this.orderModel.countDocuments({
        ...base,
        deliveryState: DeliveryState.FAILED,
      }),
      this.orderModel.countDocuments({
        ...base,
        status: OrderStatus.COMPLETED,
        deliveredAt: { $gte: startOfDay },
      }),
      this.orderModel.countDocuments({
        ...base,
        status: OrderStatus.COMPLETED,
      }),
      this.orderModel.aggregate<{ codToCollect: number; shippingFees: number }>(
        [
          {
            $match: {
              ...base,
              status: { $in: [OrderStatus.CONFIRMED, OrderStatus.SHIPPING] },
              deliveryState: {
                $in: [
                  DeliveryState.ASSIGNED,
                  DeliveryState.ACCEPTED,
                  DeliveryState.DELIVERING,
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              codToCollect: { $sum: { $ifNull: ['$receiverPayAmount', 0] } },
              shippingFees: { $sum: { $ifNull: ['$shippingFee', 0] } },
            },
          },
          { $project: { _id: 0, codToCollect: 1, shippingFees: 1 } },
        ],
      ),
    ]);

    return {
      assigned,
      delivering,
      failed,
      completedToday,
      totalCompleted,
      codToCollect: codSummary[0]?.codToCollect ?? 0,
      shippingFees: codSummary[0]?.shippingFees ?? 0,
    };
  }

  async assignShipper(orderId: string, shipperId: string, user: IUser) {
    this.assertObjectId(orderId, 'Order not found');
    this.assertObjectId(shipperId, 'Shipper không hợp lệ');
    const order = await this.getAssignableOrder(orderId, user);
    const shipper = await this.userModel.findOne({
      _id: shipperId,
      role: UserRole.SHIPPER,
      isActive: true,
      isAvailable: { $ne: false },
      isDeleted: false,
    });
    if (!shipper) {
      throw new BadRequestException(
        'Shipper không hợp lệ, đang tạm nghỉ hoặc đã bị khóa',
      );
    }
    if (!shipper.branchId) {
      throw new BadRequestException('Shipper chưa được gắn chi nhánh');
    }

    const branchId = await this.ensureDispatchBranch(order, shipper.branchId);
    if (!branchId) {
      throw new BadRequestException(
        'Không thể xác định chi nhánh từ địa chỉ lấy hàng. Hãy cập nhật địa bàn chi nhánh.',
      );
    }
    if (String(branchId) !== String(shipper.branchId)) {
      throw new BadRequestException(
        'Shipper phải thuộc cùng chi nhánh với đơn hàng',
      );
    }

    if (
      String(order.assignedShipperId ?? '') === String(shipper._id) &&
      order.deliveryState === DeliveryState.ASSIGNED &&
      order.assignmentMode === AssignmentMode.MANUAL
    ) {
      return this.findOne(orderId, user);
    }

    await this.assignOrderToShipper(
      order,
      shipper,
      AssignmentMode.MANUAL,
      user,
    );
    return this.findOne(orderId, user);
  }

  async autoAssignShipper(orderId: string, user: IUser) {
    this.assertObjectId(orderId, 'Order not found');
    const order = await this.getAssignableOrder(orderId, user);
    await this.orderModel.updateOne(
      { _id: order._id, isDeleted: false },
      { $set: { assignmentMode: AssignmentMode.AUTO } },
    );
    order.assignmentMode = AssignmentMode.AUTO;

    const result = await this.tryAutoAssignOrder(order);
    return {
      ...result,
      order: result.assigned ? await this.findOne(orderId, user) : order,
    };
  }

  async autoAssignDispatchQueue(user: IUser) {
    const filter: Record<string, any> = {
      isDeleted: false,
      status: { $in: [OrderStatus.CONFIRMED, OrderStatus.SHIPPING] },
      deliveryState: DeliveryState.UNASSIGNED,
    };
    if (user.role === UserRole.STAFF) {
      const branchId = user.branchId ?? user.BranchId;
      if (!branchId) {
        throw new ForbiddenException('Staff account has no assigned branch');
      }
      filter.branchId = new Types.ObjectId(String(branchId));
    }

    const orders = await this.orderModel
      .find(filter)
      .sort({ createdAt: 1 })
      .limit(100);
    const results: Array<{
      orderId: string;
      waybill: string;
      assigned: boolean;
      reason?: string;
      shipperId?: string;
    }> = [];

    for (const order of orders) {
      order.assignmentMode = AssignmentMode.AUTO;
      await this.orderModel.updateOne(
        { _id: order._id, isDeleted: false },
        { $set: { assignmentMode: AssignmentMode.AUTO } },
      );
      const result = await this.tryAutoAssignOrder(order);
      results.push({
        orderId: String(order._id),
        waybill: order.waybill,
        ...result,
      });
    }

    return {
      processed: results.length,
      assigned: results.filter((result) => result.assigned).length,
      pending: results.filter((result) => !result.assigned).length,
      results,
    };
  }

  private async getAssignableOrder(
    orderId: string,
    user?: IUser,
  ): Promise<OrderDocument> {
    const order = await this.orderModel.findById(orderId);
    if (!order || order.isDeleted) {
      throw new NotFoundException('Order not found');
    }
    if (user) this.assertCanAccessOrder(order, user);
    if (![OrderStatus.CONFIRMED, OrderStatus.SHIPPING].includes(order.status)) {
      throw new BadRequestException(
        'Chỉ có thể phân công shipper cho đơn đã xác nhận',
      );
    }
    const assignableStates: Array<DeliveryState | null> = [
      DeliveryState.UNASSIGNED,
      DeliveryState.ASSIGNED,
      DeliveryState.FAILED,
      null,
    ];
    if (!assignableStates.includes(order.deliveryState ?? null)) {
      throw new ConflictException(
        'Không thể đổi shipper sau khi đơn đã được nhận hoặc đang giao',
      );
    }
    return order;
  }

  private async ensureDispatchBranch(
    order: OrderDocument,
    preferredBranchId?: unknown,
  ): Promise<Types.ObjectId | null> {
    if (order.branchId) return new Types.ObjectId(order.branchId);

    const pickupAddress = await this.addressModel
      .findById(order.pickupAddressId)
      .select('provinceId communeId')
      .lean();
    if (!pickupAddress?.provinceId) return null;

    const resolution = await this.resolveBranchForPickup(
      String(pickupAddress.provinceId),
      pickupAddress.communeId ? String(pickupAddress.communeId) : undefined,
      preferredBranchId ? String(preferredBranchId) : undefined,
    );
    if (!resolution) return null;

    await this.orderModel.updateOne(
      {
        _id: order._id,
        $or: [{ branchId: null }, { branchId: { $exists: false } }],
      },
      {
        $set: {
          branchId: resolution.branchId,
          branchAssignmentSource: resolution.source,
          branchAssignedAt: new Date(),
        },
      },
    );
    order.branchId = resolution.branchId;
    order.branchAssignmentSource = resolution.source;
    return resolution.branchId;
  }

  private getVehicleLimits(): DispatchVehicleLimits {
    return {
      MOTORBIKE: Math.max(
        Number(
          this.configService.get<string>(
            'SHIPPER_MOTORBIKE_MAX_WEIGHT_KG',
            '30',
          ),
        ) || 30,
        1,
      ),
      CAR: Math.max(
        Number(
          this.configService.get<string>('SHIPPER_CAR_MAX_WEIGHT_KG', '300'),
        ) || 300,
        1,
      ),
      VAN: Math.max(
        Number(
          this.configService.get<string>('SHIPPER_VAN_MAX_WEIGHT_KG', '1000'),
        ) || 1000,
        1,
      ),
    };
  }

  private async findBestShipper(order: OrderDocument) {
    const branchId = await this.ensureDispatchBranch(order);
    if (!branchId) {
      return {
        shipper: null,
        reason: 'Chưa xác định được chi nhánh điều phối từ địa chỉ lấy hàng',
      };
    }

    const shippers = await this.userModel
      .find({
        role: UserRole.SHIPPER,
        branchId,
        isActive: true,
        isAvailable: { $ne: false },
        isDeleted: false,
      })
      .select('_id name branchId isOnline lastSeenAt vehicleType licensePlate')
      .lean();
    if (shippers.length === 0) {
      return { shipper: null, reason: 'Chi nhánh chưa có shipper sẵn sàng' };
    }

    const workload = await this.orderModel.aggregate<{
      _id: Types.ObjectId;
      activeJobs: number;
      lastAssignmentAt?: Date;
    }>([
      {
        $match: {
          assignedShipperId: { $in: shippers.map((shipper) => shipper._id) },
          isDeleted: false,
          status: { $in: [OrderStatus.CONFIRMED, OrderStatus.SHIPPING] },
          deliveryState: {
            $in: [
              DeliveryState.ASSIGNED,
              DeliveryState.ACCEPTED,
              DeliveryState.DELIVERING,
              DeliveryState.FAILED,
            ],
          },
        },
      },
      {
        $group: {
          _id: '$assignedShipperId',
          activeJobs: { $sum: 1 },
          lastAssignmentAt: { $max: '$assignedAt' },
        },
      },
    ]);
    const workloadByShipper = new Map(
      workload.map((item) => [String(item._id), item]),
    );
    const presenceTtlMs = Math.max(
      Number(
        this.configService.get<string>('SHIPPER_PRESENCE_TTL_MS', '90000'),
      ) || 90_000,
      10_000,
    );
    const maxActiveJobs = Math.max(
      Number(this.configService.get<string>('SHIPPER_MAX_ACTIVE_JOBS', '20')) ||
        20,
      1,
    );
    const onlineOnly =
      String(
        this.configService.get<string>(
          'SHIPPER_AUTO_ASSIGN_ONLINE_ONLY',
          'true',
        ),
      ).toLowerCase() !== 'false';
    const limits = this.getVehicleLimits();
    const lastRejectedShipperId = String(order.lastRejectedShipperId ?? '');
    const candidates: Array<DispatchCandidate & (typeof shippers)[number]> =
      shippers
        .map((shipper) => {
          const workloadItem = workloadByShipper.get(String(shipper._id));
          const lastSeenAt = shipper.lastSeenAt
            ? new Date(shipper.lastSeenAt).getTime()
            : 0;
          const isOnline =
            shipper.isOnline === true &&
            Number.isFinite(lastSeenAt) &&
            Date.now() - lastSeenAt <= presenceTtlMs;
          return {
            ...shipper,
            isOnline,
            activeJobs: workloadItem?.activeJobs ?? 0,
            lastAssignmentAt: workloadItem?.lastAssignmentAt,
          };
        })
        .filter(
          (shipper) =>
            (!onlineOnly || shipper.isOnline) &&
            shipper.activeJobs < maxActiveJobs &&
            String(shipper._id) !== lastRejectedShipperId &&
            canVehicleCarry(
              shipper.vehicleType,
              Number(order.weightKg) || 0,
              limits,
            ),
        );

    if (candidates.length === 0) {
      return {
        shipper: null,
        reason:
          'Không có shipper trực tuyến đáp ứng tải đơn và sức chứa phương tiện',
      };
    }
    return { shipper: rankDispatchCandidates(candidates)[0], reason: '' };
  }

  private async tryAutoAssignOrder(order: OrderDocument): Promise<{
    assigned: boolean;
    reason?: string;
    shipperId?: string;
  }> {
    if (
      ![OrderStatus.CONFIRMED, OrderStatus.SHIPPING].includes(order.status) ||
      ![DeliveryState.UNASSIGNED, DeliveryState.FAILED, null].includes(
        order.deliveryState ?? null,
      )
    ) {
      return { assigned: false, reason: 'Đơn không còn chờ điều phối' };
    }
    const candidate = await this.findBestShipper(order);
    if (!candidate.shipper) {
      return { assigned: false, reason: candidate.reason };
    }
    try {
      await this.assignOrderToShipper(
        order,
        candidate.shipper,
        AssignmentMode.AUTO,
      );
      return {
        assigned: true,
        shipperId: String(candidate.shipper._id),
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        return {
          assigned: false,
          reason: 'Đơn vừa được một phiên điều phối khác cập nhật',
        };
      }
      throw error;
    }
  }

  private async assignOrderToShipper(
    order: OrderDocument,
    shipper: Pick<UserDocument, '_id' | 'name'>,
    mode: AssignmentMode,
    actor?: IUser,
  ): Promise<OrderDocument> {
    const assignedAt = new Date();
    const assignmentResponseMinutes = Math.max(
      Number(
        this.configService.get<string>(
          'SHIPPER_ASSIGNMENT_RESPONSE_MINUTES',
          '15',
        ),
      ) || 15,
      1,
    );
    const assignmentExpiresAt = new Date(
      assignedAt.getTime() + assignmentResponseMinutes * 60_000,
    );
    const historyEntry: Record<string, unknown> = {
      shipperId: shipper._id,
      action: 'ASSIGNED',
      mode,
      at: assignedAt,
    };
    if (actor?._id) historyEntry.actorId = new Types.ObjectId(actor._id);

    const assignedOrder = await this.orderModel.findOneAndUpdate(
      {
        _id: order._id,
        isDeleted: false,
        status: { $in: [OrderStatus.CONFIRMED, OrderStatus.SHIPPING] },
        deliveryState: order.deliveryState ?? null,
        assignedShipperId: order.assignedShipperId ?? null,
      },
      {
        $set: {
          assignedShipperId: shipper._id,
          assignedAt,
          assignmentExpiresAt,
          assignmentMode: mode,
          deliveryState: DeliveryState.ASSIGNED,
        },
        $push: { assignmentHistory: historyEntry },
        $unset: {
          acceptedAt: 1,
          assignmentRejectedAt: 1,
          assignmentRejectionReason: 1,
          lastRejectedShipperId: 1,
          deliveryStartedAt: 1,
          deliveryFailureReason: 1,
          deliveryFailedAt: 1,
          recipientConfirmedName: 1,
          proofOfDeliveryUrl: 1,
          deliveryNote: 1,
        },
      },
      { new: true, runValidators: true },
    );
    if (!assignedOrder) {
      throw new ConflictException(
        'Đơn hàng vừa được cập nhật. Vui lòng tải lại trước khi phân công.',
      );
    }

    const previousShipperId = order.assignedShipperId
      ? String(order.assignedShipperId)
      : '';
    if (previousShipperId && previousShipperId !== String(shipper._id)) {
      await this.notificationsService.dismissOrderNotifications(
        String(order._id),
        previousShipperId,
      );
      this.notificationsService.emitUserEvent(
        previousShipperId,
        'assignment:changed',
        { orderId: String(order._id), action: 'REASSIGNED' },
      );
    }

    this.notificationsService
      .create({
        recipient: String(shipper._id),
        title:
          mode === AssignmentMode.AUTO
            ? 'Hệ thống tự động đề nghị đơn mới'
            : 'Bạn có đơn giao mới',
        message: `Đơn ${assignedOrder.waybill} đang chờ bạn xác nhận trước ${assignmentExpiresAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`,
        type: NotificationType.PUSH,
        relatedOrderId: String(order._id),
      })
      .catch((error) =>
        this.logger.warn(
          `Không thể gửi thông báo cho shipper: ${error.message}`,
        ),
      );
    return assignedOrder;
  }

  async unassignShipper(orderId: string, user: IUser) {
    this.assertObjectId(orderId, 'Order not found');
    const order = await this.orderModel.findById(orderId);
    if (!order || order.isDeleted)
      throw new NotFoundException('Order not found');
    this.assertCanAccessOrder(order, user);
    const unassignableStates = [
      DeliveryState.ASSIGNED,
      DeliveryState.ACCEPTED,
      DeliveryState.FAILED,
    ];
    if (!unassignableStates.includes(order.deliveryState)) {
      throw new BadRequestException(
        'Chỉ có thể hủy phân công khi đơn chưa giao hoặc đang chờ xử lý lại',
      );
    }
    const updated = await this.orderModel.findOneAndUpdate(
      {
        _id: order._id,
        isDeleted: false,
        status: { $in: [OrderStatus.CONFIRMED, OrderStatus.SHIPPING] },
        deliveryState: { $in: unassignableStates },
      },
      {
        $set: {
          assignedShipperId: null,
          deliveryState: DeliveryState.UNASSIGNED,
          assignmentMode: AssignmentMode.MANUAL,
        },
        $push: {
          assignmentHistory: {
            shipperId: order.assignedShipperId,
            action: 'UNASSIGNED',
            at: new Date(),
            actorId: new Types.ObjectId(user._id),
          },
        },
        $unset: {
          assignedAt: 1,
          assignmentExpiresAt: 1,
          acceptedAt: 1,
          deliveryStartedAt: 1,
          deliveryFailureReason: 1,
          deliveryFailedAt: 1,
        },
      },
      { new: true, runValidators: true },
    );
    if (!updated) {
      throw new ConflictException(
        'Trạng thái đơn vừa thay đổi, không thể hủy phân công',
      );
    }
    const previousShipperId = order.assignedShipperId
      ? String(order.assignedShipperId)
      : '';
    if (previousShipperId) {
      await this.notificationsService.dismissOrderNotifications(
        orderId,
        previousShipperId,
      );
      this.notificationsService.emitUserEvent(
        previousShipperId,
        'assignment:changed',
        {
          orderId,
          action: 'UNASSIGNED',
        },
      );
    }
    return updated;
  }

  async acceptDelivery(orderId: string, user: IUser) {
    this.assertObjectId(orderId, 'Không tìm thấy đơn được phân công');
    this.assertObjectId(user._id, 'Tài khoản shipper không hợp lệ');
    const now = new Date();
    const order = await this.orderModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(orderId),
        assignedShipperId: new Types.ObjectId(user._id),
        isDeleted: false,
        status: { $in: [OrderStatus.CONFIRMED, OrderStatus.SHIPPING] },
        deliveryState: DeliveryState.ASSIGNED,
        $or: [
          { assignmentExpiresAt: { $exists: false } },
          { assignmentExpiresAt: null },
          { assignmentExpiresAt: { $gt: now } },
        ],
      },
      {
        $set: {
          deliveryState: DeliveryState.ACCEPTED,
          acceptedAt: now,
        },
        $push: {
          assignmentHistory: {
            shipperId: new Types.ObjectId(user._id),
            action: 'ACCEPTED',
            at: now,
            actorId: new Types.ObjectId(user._id),
          },
        },
        $unset: { assignmentExpiresAt: 1 },
      },
      { new: true, runValidators: true },
    );
    if (!order) {
      const expired = await this.expireAssignmentForShipper(orderId, user);
      if (expired) {
        throw new ConflictException(
          'Đề nghị giao hàng đã hết hạn và được trả về hàng chờ điều phối',
        );
      }
      await this.throwAssignedDeliveryError(
        orderId,
        user,
        'Đơn hàng không còn ở trạng thái có thể nhận hoặc đã hết hạn phản hồi',
      );
    }
    await Promise.allSettled([
      this.notificationsService.create({
        recipient: 'role:ADMIN',
        title: 'Shipper đã nhận đơn giao',
        message: `${user.name || user.email} đã nhận đơn ${order.waybill}`,
        type: NotificationType.PUSH,
        relatedOrderId: String(order._id),
      }),
      this.notificationsService.create({
        recipient: 'role:STAFF',
        title: 'Shipper đã xác nhận phân công',
        message: `Đơn ${order.waybill} đã được shipper nhận`,
        type: NotificationType.PUSH,
        relatedOrderId: String(order._id),
      }),
    ]);
    return this.findOne(orderId, user);
  }

  async rejectDelivery(orderId: string, dto: RejectAssignmentDto, user: IUser) {
    this.assertObjectId(orderId, 'Không tìm thấy đơn được phân công');
    this.assertObjectId(user._id, 'Tài khoản shipper không hợp lệ');
    const now = new Date();
    const reason = dto.reason.trim();
    const order = await this.orderModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(orderId),
        assignedShipperId: new Types.ObjectId(user._id),
        isDeleted: false,
        status: { $in: [OrderStatus.CONFIRMED, OrderStatus.SHIPPING] },
        deliveryState: DeliveryState.ASSIGNED,
      },
      {
        $set: {
          assignedShipperId: null,
          deliveryState: DeliveryState.UNASSIGNED,
          assignmentRejectedAt: now,
          assignmentRejectionReason: reason,
          lastRejectedShipperId: new Types.ObjectId(user._id),
        },
        $push: {
          assignmentHistory: {
            shipperId: new Types.ObjectId(user._id),
            action: 'REJECTED',
            at: now,
            reason,
            actorId: new Types.ObjectId(user._id),
          },
        },
        $unset: { assignedAt: 1, assignmentExpiresAt: 1, acceptedAt: 1 },
      },
      { new: true, runValidators: true },
    );
    if (!order) {
      await this.throwAssignedDeliveryError(
        orderId,
        user,
        'Đơn hàng không còn ở trạng thái có thể từ chối',
      );
    }
    await this.notificationsService.dismissOrderNotifications(
      orderId,
      String(user._id),
    );
    this.notificationsService.emitUserEvent(
      String(user._id),
      'assignment:changed',
      {
        orderId,
        action: 'REJECTED',
      },
    );
    await Promise.allSettled([
      this.notificationsService.create({
        recipient: 'role:ADMIN',
        title: 'Shipper từ chối đơn giao',
        message: `${user.name || user.email} đã từ chối đơn ${order.waybill}: ${reason}`,
        type: NotificationType.PUSH,
        relatedOrderId: String(order._id),
      }),
      this.notificationsService.create({
        recipient: 'role:STAFF',
        title: 'Đơn cần phân công lại',
        message: `Đơn ${order.waybill} đã được shipper từ chối`,
        type: NotificationType.PUSH,
        relatedOrderId: String(order._id),
      }),
    ]);
    if (order.assignmentMode === AssignmentMode.AUTO) {
      this.queueAutomaticAssignment(order);
    }
    return order;
  }

  @Cron('*/30 * * * * *')
  async runAutomaticDispatchQueue(): Promise<void> {
    if (this.autoDispatchRunning) return;
    const globalMode = String(
      this.configService.get<string>('SHIPPER_DISPATCH_MODE', 'MANUAL'),
    ).toUpperCase();
    this.autoDispatchRunning = true;
    try {
      const modeFilter =
        globalMode === AssignmentMode.AUTO
          ? {}
          : { assignmentMode: AssignmentMode.AUTO };
      const orders = await this.orderModel
        .find({
          ...modeFilter,
          isDeleted: false,
          status: { $in: [OrderStatus.CONFIRMED, OrderStatus.SHIPPING] },
          deliveryState: DeliveryState.UNASSIGNED,
        })
        .sort({ createdAt: 1 })
        .limit(50);

      for (const order of orders) {
        if (globalMode === AssignmentMode.AUTO) {
          order.assignmentMode = AssignmentMode.AUTO;
          await this.orderModel.updateOne(
            { _id: order._id, isDeleted: false },
            { $set: { assignmentMode: AssignmentMode.AUTO } },
          );
        }
        await this.tryAutoAssignOrder(order);
      }
    } catch (error) {
      this.logger.error(
        `Điều phối tự động thất bại: ${error instanceof Error ? error.message : error}`,
      );
    } finally {
      this.autoDispatchRunning = false;
    }
  }

  private queueAutomaticAssignment(order: OrderDocument): void {
    setTimeout(() => {
      this.tryAutoAssignOrder(order).catch((error) =>
        this.logger.warn(
          `Không thể tự phân công đơn ${order.waybill}: ${error instanceof Error ? error.message : error}`,
        ),
      );
    }, 0);
  }

  @Cron('0 * * * * *')
  async expirePendingShipperAssignments(): Promise<void> {
    if (this.expiringAssignments) return;
    this.expiringAssignments = true;
    try {
      const expired = await this.orderModel
        .find({
          deliveryState: DeliveryState.ASSIGNED,
          assignmentExpiresAt: { $lte: new Date() },
          assignedShipperId: { $ne: null },
          isDeleted: false,
        })
        .select('_id waybill assignedShipperId assignmentExpiresAt')
        .limit(100)
        .lean();

      for (const assignment of expired) {
        const shipperId = String(assignment.assignedShipperId);
        const at = new Date();
        const updated = await this.orderModel.findOneAndUpdate(
          {
            _id: assignment._id,
            deliveryState: DeliveryState.ASSIGNED,
            assignedShipperId: assignment.assignedShipperId,
            assignmentExpiresAt: { $lte: at },
          },
          {
            $set: {
              assignedShipperId: null,
              deliveryState: DeliveryState.UNASSIGNED,
              lastRejectedShipperId: assignment.assignedShipperId,
            },
            $push: {
              assignmentHistory: {
                shipperId: assignment.assignedShipperId,
                action: 'EXPIRED',
                at,
                reason: 'Không phản hồi phân công đúng hạn',
              },
            },
            $unset: { assignedAt: 1, assignmentExpiresAt: 1 },
          },
          { new: true },
        );
        if (!updated) continue;
        await this.notificationsService.dismissOrderNotifications(
          String(assignment._id),
          shipperId,
        );
        this.notificationsService.emitUserEvent(
          shipperId,
          'assignment:changed',
          {
            orderId: String(assignment._id),
            action: 'EXPIRED',
          },
        );
        await Promise.allSettled([
          this.notificationsService.create({
            recipient: 'role:ADMIN',
            title: 'Phân công shipper đã hết hạn',
            message: `Đơn ${assignment.waybill} cần được phân công lại`,
            type: NotificationType.PUSH,
            relatedOrderId: String(assignment._id),
          }),
          this.notificationsService.create({
            recipient: 'role:STAFF',
            title: 'Đơn cần phân công lại',
            message: `Shipper không phản hồi đơn ${assignment.waybill} đúng hạn`,
            type: NotificationType.PUSH,
            relatedOrderId: String(assignment._id),
          }),
        ]);
        if (updated.assignmentMode === AssignmentMode.AUTO) {
          this.queueAutomaticAssignment(updated);
        }
      }
    } finally {
      this.expiringAssignments = false;
    }
  }

  private async expireAssignmentForShipper(
    orderId: string,
    user: IUser,
  ): Promise<boolean> {
    const now = new Date();
    const result = await this.orderModel.updateOne(
      {
        _id: new Types.ObjectId(orderId),
        assignedShipperId: new Types.ObjectId(user._id),
        deliveryState: DeliveryState.ASSIGNED,
        assignmentExpiresAt: { $lte: now },
      },
      {
        $set: {
          assignedShipperId: null,
          deliveryState: DeliveryState.UNASSIGNED,
          lastRejectedShipperId: new Types.ObjectId(user._id),
        },
        $push: {
          assignmentHistory: {
            shipperId: new Types.ObjectId(user._id),
            action: 'EXPIRED',
            at: now,
            reason: 'Không phản hồi phân công đúng hạn',
          },
        },
        $unset: { assignedAt: 1, assignmentExpiresAt: 1 },
      },
    );
    const expired = result.modifiedCount > 0;
    if (expired) {
      await this.notificationsService.dismissOrderNotifications(
        orderId,
        String(user._id),
      );
      this.notificationsService.emitUserEvent(
        String(user._id),
        'assignment:changed',
        {
          orderId,
          action: 'EXPIRED',
        },
      );
    }
    return expired;
  }

  async startDelivery(orderId: string, user: IUser) {
    this.assertObjectId(orderId, 'Không tìm thấy đơn được phân công');
    this.assertObjectId(user._id, 'Tài khoản shipper không hợp lệ');
    const previous = await this.orderModel
      .findOne({
        _id: orderId,
        assignedShipperId: new Types.ObjectId(user._id),
        isDeleted: false,
        deliveryState: DeliveryState.ACCEPTED,
      })
      .select('status')
      .lean();
    const order = await this.transitionAssignedDelivery(
      orderId,
      user,
      [OrderStatus.CONFIRMED, OrderStatus.SHIPPING],
      DeliveryState.ACCEPTED,
      DeliveryState.DELIVERING,
      {
        $set: {
          status: OrderStatus.SHIPPING,
          deliveryState: DeliveryState.DELIVERING,
          deliveryStartedAt: new Date(),
        },
        $inc: { deliveryAttempts: 1 },
        $unset: {
          deliveryFailureReason: 1,
          deliveryFailedAt: 1,
        },
      },
      'Shipper phải nhận đơn trước khi bắt đầu giao',
    );
    if (previous?.status === OrderStatus.CONFIRMED) {
      await this.recordShipperStatusChange(order, OrderStatus.CONFIRMED, user);
    } else if (previous?.status === OrderStatus.SHIPPING) {
      await this.createDeliveryTracking(order, user, {
        location: 'Tuyến giao hàng',
        note: 'Shipper bắt đầu giao đơn được điều phối lại',
      });
    }
    return this.findOne(orderId, user);
  }

  async completeDelivery(
    orderId: string,
    dto: CompleteDeliveryDto,
    user: IUser,
  ) {
    this.assertCoordinatePair(dto.lat, dto.lng);
    const requireProof =
      String(
        this.configService.get<string>(
          'SHIPPER_REQUIRE_DELIVERY_PROOF',
          'true',
        ),
      ).toLowerCase() !== 'false';
    if (requireProof && !dto.proofOfDeliveryUrl?.trim()) {
      throw new BadRequestException(
        'Cần ảnh bằng chứng giao hàng trước khi hoàn tất đơn',
      );
    }
    const now = new Date();
    const update: Record<string, any> = {
      $set: {
        status: OrderStatus.COMPLETED,
        deliveryState: DeliveryState.DELIVERED,
        deliveredAt: now,
        recipientConfirmedName: dto.recipientName.trim(),
      },
      $unset: {
        deliveryFailureReason: 1,
        deliveryFailedAt: 1,
      },
    };
    if (dto.note?.trim()) update.$set.deliveryNote = dto.note.trim();
    else update.$unset.deliveryNote = 1;
    if (dto.proofOfDeliveryUrl?.trim()) {
      update.$set.proofOfDeliveryUrl = this.normalizeProofOfDeliveryPath(
        dto.proofOfDeliveryUrl,
      );
    } else {
      update.$unset.proofOfDeliveryUrl = 1;
    }
    if (dto.lat !== undefined && dto.lng !== undefined) {
      update.$set.lastDeliveryLocation = {
        lat: dto.lat,
        lng: dto.lng,
        updatedAt: now,
      };
    }

    const order = await this.transitionAssignedDelivery(
      orderId,
      user,
      [OrderStatus.SHIPPING],
      DeliveryState.DELIVERING,
      DeliveryState.DELIVERED,
      update,
      'Đơn hàng chưa ở trạng thái đang giao',
    );
    await this.recordShipperStatusChange(order, OrderStatus.SHIPPING, user);
    return this.findOne(orderId, user);
  }

  async failDelivery(orderId: string, dto: FailDeliveryDto, user: IUser) {
    this.assertCoordinatePair(dto.lat, dto.lng);
    const now = new Date();
    const update: Record<string, any> = {
      $set: {
        deliveryState: DeliveryState.FAILED,
        deliveryFailedAt: now,
        deliveryFailureReason: dto.reason.trim(),
      },
    };
    if (dto.lat !== undefined && dto.lng !== undefined) {
      update.$set.lastDeliveryLocation = {
        lat: dto.lat,
        lng: dto.lng,
        updatedAt: now,
      };
    }

    const order = await this.transitionAssignedDelivery(
      orderId,
      user,
      [OrderStatus.SHIPPING],
      DeliveryState.DELIVERING,
      DeliveryState.FAILED,
      update,
      'Chỉ có thể báo giao thất bại cho đơn đang giao',
    );
    await this.createDeliveryTracking(order, user, {
      location: 'Điểm giao hàng',
      note: `Giao chưa thành công: ${dto.reason.trim()}`,
    });
    await Promise.allSettled([
      this.notificationsService.create({
        recipient: 'role:ADMIN',
        title: 'Đơn giao chưa thành công',
        message: `Đơn ${order.waybill} cần được theo dõi: ${dto.reason.trim()}`,
        type: NotificationType.PUSH,
        relatedOrderId: String(order._id),
      }),
      this.notificationsService.create({
        recipient: 'role:STAFF',
        title: 'Đơn cần xử lý sau giao thất bại',
        message: `Đơn ${order.waybill}: ${dto.reason.trim()}`,
        type: NotificationType.PUSH,
        relatedOrderId: String(order._id),
      }),
    ]);
    return order;
  }

  async retryDelivery(orderId: string, user: IUser) {
    this.assertObjectId(orderId, 'Không tìm thấy đơn được phân công');
    this.assertObjectId(user._id, 'Tài khoản shipper không hợp lệ');
    const current = await this.orderModel
      .findOne({
        _id: orderId,
        assignedShipperId: new Types.ObjectId(user._id),
        isDeleted: false,
        deliveryState: DeliveryState.FAILED,
      })
      .select('deliveryAttempts')
      .lean();
    const maxAttempts = Math.max(
      Number(
        this.configService.get<string>('SHIPPER_MAX_DELIVERY_ATTEMPTS', '3'),
      ) || 3,
      1,
    );
    if (current && Number(current.deliveryAttempts || 0) >= maxAttempts) {
      throw new ConflictException(
        `Đơn đã đạt ${maxAttempts} lần giao. Vui lòng chuyển điều phối viên xử lý thay vì tự giao lại.`,
      );
    }
    const order = await this.transitionAssignedDelivery(
      orderId,
      user,
      [OrderStatus.SHIPPING],
      DeliveryState.FAILED,
      DeliveryState.DELIVERING,
      {
        $set: {
          deliveryState: DeliveryState.DELIVERING,
          deliveryStartedAt: new Date(),
        },
        $inc: { deliveryAttempts: 1 },
        $unset: {
          deliveryFailureReason: 1,
          deliveryFailedAt: 1,
        },
      },
      'Đơn hàng không còn ở trạng thái có thể giao lại',
    );
    await this.createDeliveryTracking(order, user, {
      location: 'Tuyến giao hàng',
      note: 'Shipper tiếp tục giao lại đơn hàng',
    });
    return order;
  }

  async updateDeliveryLocation(
    orderId: string,
    dto: DeliveryLocationDto,
    user: IUser,
  ) {
    this.assertObjectId(orderId, 'Không tìm thấy đơn được phân công');
    const updatedAt = new Date();
    const order = await this.orderModel.findOneAndUpdate(
      {
        _id: orderId,
        assignedShipperId: new Types.ObjectId(user._id),
        isDeleted: false,
        status: { $in: [OrderStatus.CONFIRMED, OrderStatus.SHIPPING] },
        deliveryState: {
          $in: [DeliveryState.ACCEPTED, DeliveryState.DELIVERING],
        },
      },
      {
        $set: {
          lastDeliveryLocation: { lat: dto.lat, lng: dto.lng, updatedAt },
        },
      },
      { new: true, runValidators: true },
    );
    if (!order) {
      await this.throwAssignedDeliveryError(
        orderId,
        user,
        'Chỉ có thể cập nhật vị trí sau khi nhận đơn',
      );
    }
    return { updatedAt: order.lastDeliveryLocation.updatedAt };
  }

  private async transitionAssignedDelivery(
    orderId: string,
    user: IUser,
    expectedStatuses: OrderStatus[],
    fromState: DeliveryState,
    toState: DeliveryState,
    update: Record<string, any>,
    conflictMessage: string,
  ): Promise<OrderDocument> {
    this.assertObjectId(orderId, 'Không tìm thấy đơn được phân công');
    this.assertObjectId(user._id, 'Tài khoản shipper không hợp lệ');
    if (!canTransitionDeliveryState(fromState, toState)) {
      throw new BadRequestException(
        `Không thể chuyển trạng thái giao hàng từ ${fromState} sang ${toState}`,
      );
    }

    const order = await this.orderModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(orderId),
        assignedShipperId: new Types.ObjectId(user._id),
        isDeleted: false,
        status: { $in: expectedStatuses },
        deliveryState: fromState,
      },
      update,
      { new: true, runValidators: true },
    );
    if (!order) {
      await this.throwAssignedDeliveryError(orderId, user, conflictMessage);
    }
    return order;
  }

  private async throwAssignedDeliveryError(
    orderId: string,
    user: IUser,
    conflictMessage: string,
  ): Promise<never> {
    const assigned = await this.orderModel.exists({
      _id: new Types.ObjectId(orderId),
      assignedShipperId: new Types.ObjectId(user._id),
      isDeleted: false,
    });
    if (!assigned) {
      throw new NotFoundException('Không tìm thấy đơn được phân công');
    }
    throw new ConflictException(conflictMessage);
  }

  private async createDeliveryTracking(
    order: OrderDocument,
    user: IUser,
    details: { location: string; note: string },
  ): Promise<void> {
    try {
      await this.trackingModel.create({
        orderId: order._id,
        status: order.status,
        timestamp: new Date(),
        location: details.location,
        note: details.note,
        createdBy: { _id: new Types.ObjectId(user._id), email: user.email },
        branchId: order.branchId || null,
      });
    } catch (error) {
      this.logger.warn(
        `Không thể tạo tracking cho đơn ${order.waybill}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private async recordShipperStatusChange(
    order: OrderDocument,
    oldStatus: OrderStatus,
    user: IUser,
  ): Promise<void> {
    await this.createDeliveryTracking(order, user, {
      location: order.branchId ? 'Tuyến giao hàng' : 'Hệ thống AP Post',
      note: `Trạng thái chuyển từ ${oldStatus} sang ${order.status}`,
    });

    if (order.email) {
      this.mailService
        .sendStatusUpdate({
          to: order.email.trim(),
          receiverName: order.receiverName || 'Khách hàng',
          waybill: order.waybill,
          status: order.status,
          trackingUrl: `${this.configService.get<string>(
            'PUBLIC_APP_URL',
            'http://localhost:4200',
          )}/tracking?q=${encodeURIComponent(order.waybill)}`,
          codValue: order.codValue,
        })
        .catch((error) =>
          this.logger.warn(
            `Không thể gửi email trạng thái đơn ${order.waybill}: ${error.message}`,
          ),
        );
    }
  }

  private assertCoordinatePair(lat?: number, lng?: number): void {
    if ((lat === undefined) !== (lng === undefined)) {
      throw new BadRequestException('Vĩ độ và kinh độ phải được gửi cùng nhau');
    }
  }

  private isValidObjectId(value: string): boolean {
    return Types.ObjectId.isValid(value);
  }

  private assertObjectId(value: string, message: string): void {
    if (!this.isValidObjectId(value)) throw new NotFoundException(message);
  }

  private normalizeProofOfDeliveryPath(value: string): string {
    const trimmed = value.trim();
    let pathname = trimmed;
    if (/^https?:\/\//i.test(trimmed)) {
      try {
        pathname = new URL(trimmed).pathname;
      } catch {
        throw new BadRequestException('Đường dẫn ảnh giao hàng không hợp lệ');
      }
    }
    if (!/^\/images\/proof\/[a-f0-9-]+\.(?:jpg|png)$/i.test(pathname)) {
      throw new BadRequestException('Đường dẫn ảnh giao hàng không hợp lệ');
    }
    return pathname;
  }

  private async findIdempotentOrder(
    dto: CreateOrderDto,
    user?: IUser,
  ): Promise<{ order: OrderDocument; payment: any } | null> {
    if (!dto.clientRequestId) return null;
    const order = await this.orderModel.findOne({
      clientRequestId: dto.clientRequestId,
      isDeleted: false,
    });
    if (!order) return null;

    const sameOwner = user
      ? String(order.userId ?? order.createdBy?._id ?? '') === String(user._id)
      : order.channel === OrderChannel.B2C_GUEST &&
        this.normalizePhone(order.senderPhone) ===
          this.normalizePhone(dto.senderPhone);
    if (!sameOwner) {
      throw new ConflictException('Mã chống tạo trùng đã được sử dụng');
    }
    const payment = await this.paymentsService.findByOrderId(String(order._id));
    if (!payment) {
      throw new ConflictException(
        'Đơn đã tồn tại nhưng dữ liệu thanh toán chưa sẵn sàng',
      );
    }
    return { order, payment };
  }

  async confirmPayment(orderId: string, user: IUser) {
    const order = await this.orderModel.findById(orderId);
    if (!order || order.isDeleted) {
      throw new NotFoundException('Không tìm thấy đơn hàng');
    }

    this.assertCanAccessOrder(order, user);

    if (!MANUAL_PAYMENT_METHODS.includes(order.paymentMethod as never)) {
      throw new BadRequestException(
        'Phương thức thanh toán này phải được xác nhận bởi cổng thanh toán',
      );
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        'Chỉ đơn hàng PENDING mới có thể xác nhận thanh toán',
      );
    }

    await this.paymentsService.markManualPaymentPaid(orderId);
    const updatedOrder = await this.updateStatus(
      orderId,
      OrderStatus.CONFIRMED,
      user,
    );

    return {
      success: true,
      message: 'Đơn hàng đã được xác nhận thanh toán thành công',
      order: updatedOrder,
    };
  }

  async findByWaybill(waybill: string) {
    const order = await this.orderModel
      .findOne({ waybill, isDeleted: false })
      .lean();
    if (!order || order.isDeleted) {
      throw new NotFoundException('Không tìm thấy đơn hàng');
    }
    return order;
  }
}
