// src/orders/orders.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import aqp from 'api-query-params';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import { Connection, Types } from 'mongoose';
import { IUser } from 'src/types/user.interface';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import {
  Order,
  OrderDocument,
  OrderStatus,
  OrderChannel,
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
import { customAlphabet } from 'nanoid';
import dayjs from 'dayjs';
import { ConfigService } from '@nestjs/config';
import {
  PublicOrderOtp,
  PublicOrderOtpDocument,
} from './schemas/public-order-otp.schema';

@Injectable()
export class OrdersService {
  private trackingModel: any;
  private readonly genOtp = customAlphabet('0123456789', 6);
  private readonly genOtpToken = customAlphabet(
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    32,
  );

  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: SoftDeleteModel<OrderDocument>,
    @InjectModel(Address.name)
    private readonly addressModel: SoftDeleteModel<AddressDocument>,
    @InjectModel(Commune.name)
    private readonly communeModel: SoftDeleteModel<CommuneDocument>,
    @InjectModel(Province.name)
    private readonly provinceModel: SoftDeleteModel<ProvinceDocument>,
    @InjectModel(Branch.name)
    private readonly branchModel: SoftDeleteModel<BranchDocument>,
    @InjectModel(PublicOrderOtp.name)
    private readonly publicOrderOtpModel: SoftDeleteModel<PublicOrderOtpDocument>,
    @InjectModel(User.name)
    private readonly userModel: SoftDeleteModel<UserDocument>,
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

  async requestPublicOtp(phoneRaw: string) {
    const phone = this.normalizePhone(phoneRaw);
    if (!/^[0-9]{9,11}$/.test(phone)) {
      throw new BadRequestException('Số điện thoại không hợp lệ');
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
        phone,
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
      phone,
      createdAt: { $gte: now.subtract(30, 'minute').toDate() },
    });
    if (sentCountInWindow >= maxPerWindow) {
      throw new BadRequestException(
        'Bạn đã vượt quá số lần gửi OTP. Vui lòng thử lại sau 30 phút.',
      );
    }

    const token = this.genOtpToken();
    const code = this.genOtp();
    await this.publicOrderOtpModel.create({
      phone,
      code,
      token,
      expiresAt: dayjs().add(5, 'minute').toDate(),
    });

    // Demo OTP cho môi trường dev/test: trả về code để test nhanh
    return {
      otpToken: token,
      expiresInSeconds: 300,
      devOtpCode:
        this.configService.get<string>('NODE_ENV') === 'production'
          ? undefined
          : code,
      message: 'OTP đã được tạo. Vui lòng xác thực trước khi tạo đơn.',
    };
  }

  async verifyPublicOtp(phoneRaw: string, codeRaw: string) {
    const phone = this.normalizePhone(phoneRaw);
    const code = (codeRaw || '').trim();

    const otpRecord = await this.publicOrderOtpModel
      .findOne({
        phone,
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

    if (otpRecord.code !== code) {
      otpRecord.attempts += 1;
      await otpRecord.save();
      throw new BadRequestException('OTP không đúng');
    }

    otpRecord.verifiedAt = new Date();
    await otpRecord.save();

    return {
      otpToken: otpRecord.token,
      verified: true,
      message: 'Xác thực OTP thành công',
    };
  }

  private async assertPublicOtpVerified(
    phoneRaw: string,
    otpToken?: string,
  ): Promise<PublicOrderOtpDocument> {
    const phone = this.normalizePhone(phoneRaw);
    if (!otpToken) {
      throw new BadRequestException('Thiếu OTP token cho đơn B2C');
    }

    const otpRecord = await this.publicOrderOtpModel.findOne({
      token: otpToken,
      phone,
      usedAt: null,
    });
    if (!otpRecord) {
      throw new BadRequestException('OTP token không hợp lệ');
    }
    if (!otpRecord.verifiedAt) {
      throw new BadRequestException('OTP chưa được xác thực');
    }
    if (dayjs().isAfter(otpRecord.expiresAt)) {
      throw new BadRequestException('OTP token đã hết hạn');
    }
    return otpRecord;
  }

  private async resolveBranchForPublicOrder(
    pickupProvinceId: string,
    pickupCommuneId?: string,
  ): Promise<Types.ObjectId | null> {
    if (pickupCommuneId) {
      const commune = await this.communeModel.findById(pickupCommuneId).lean();
      if (commune?.name) {
        const communeBranch = await this.branchModel
          .findOne({
            isDeleted: false,
            isActive: true,
            communeName: new RegExp(`^${commune.name}$`, 'i'),
          })
          .sort({ createdAt: 1 })
          .lean();

        if (communeBranch?._id) {
          return new Types.ObjectId(communeBranch._id);
        }
      }
    }

    const province = await this.provinceModel.findById(pickupProvinceId).lean();
    if (!province?.name) return null;

    const branch = await this.branchModel
      .findOne({
        isDeleted: false,
        isActive: true,
        provinceName: new RegExp(`^${province.name}$`, 'i'),
      })
      .sort({ createdAt: 1 })
      .lean();

    if (!branch?._id) return null;
    return new Types.ObjectId(branch._id);
  }

  // ====================== TẠO ĐƠN HÀNG (ĐÃ TỐI ƯU) ======================
  async create(dto: CreateOrderDto, user: IUser) {
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
    const shippingFeePayer = dto.shippingFeePayer || 'SENDER';
    const codValue = Number(dto.codValue) || 0;

    let senderPayAmount = shippingFeePayer === 'SENDER' ? shippingFee : 0;
    let receiverPayAmount =
      codValue + (shippingFeePayer === 'RECEIVER' ? shippingFee : 0);

    const isOnlinePayment = dto.paymentMethod === 'MOMO';

    if (isOnlinePayment && shippingFeePayer === 'SENDER') {
      senderPayAmount += codValue;
      receiverPayAmount = 0;
    }

    const totalOrderValue = codValue + shippingFee;

    const [pickupAddr, deliveryAddr] = await Promise.all([
      this.addressModel.create(dto.pickupAddress),
      this.addressModel.create(dto.deliveryAddress),
    ]);

    let branchId: Types.ObjectId | null = null;
    const rawBranchId = user.branchId ?? (user as any).branchId ?? null;

    if (user.role === 'STAFF') {
      if (!rawBranchId)
        throw new BadRequestException('Nhân viên chưa được gắn bưu cục.');
      branchId = new Types.ObjectId(rawBranchId);
    } else if (user.role === 'ADMIN' && rawBranchId) {
      branchId = new Types.ObjectId(rawBranchId);
    }

    const newOrder = await this.orderModel.create({
      ...dto,
      pickupAddressId: pickupAddr._id,
      deliveryAddressId: deliveryAddr._id,
      userId: new Types.ObjectId(user._id),
      branchId,
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
      paymentMethod: dto.paymentMethod || 'CASH',
      channel: user.role === 'STAFF' ? OrderChannel.B2B_STAFF : OrderChannel.B2C_USER,
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
          console.warn('Gửi email xác nhận thất bại:', err.message),
        );
    }

    // TẠO PAYMENT
    const payment = await this.paymentsService.createPaymentForOrder(
      newOrder._id.toString(),
      {
        method: dto.paymentMethod || 'CASH',
        amount: senderPayAmount || totalOrderValue,
        status: dto.paymentMethod === 'CASH' ? 'paid' : 'pending',
        // Dùng _id của Order làm transactionId để khớp với Return URL của MoMo
        transactionId: newOrder._id.toString(),
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
        const found = await this.userModel.findOne({ email: emailNorm }).lean();
        if (found && found._id) recipient = String(found._id);
      }

      if (!recipient && receiverPhoneNorm) {
        const foundByPhone = await this.userModel.findOne({ phone: receiverPhoneNorm }).lean();
        if (foundByPhone && foundByPhone._id) recipient = String(foundByPhone._id);
      }

      if (!recipient && senderPhoneNorm) {
        const foundByPhone = await this.userModel.findOne({ phone: senderPhoneNorm }).lean();
        if (foundByPhone && foundByPhone._id) recipient = String(foundByPhone._id);
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
      } catch (e) {
        // ignore
      }
    } catch (err) {
      console.warn('Failed to create/send order notification:', err?.message || err);
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
    const otpRecord = await this.assertPublicOtpVerified(
      dto.senderPhone,
      dto.publicOtpToken,
    );

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
    const shippingFeePayer = dto.shippingFeePayer || 'SENDER';
    const codValue = Number(dto.codValue) || 0;

    let senderPayAmount = shippingFeePayer === 'SENDER' ? shippingFee : 0;
    let receiverPayAmount =
      codValue + (shippingFeePayer === 'RECEIVER' ? shippingFee : 0);

    const isOnlinePayment = dto.paymentMethod === 'MOMO';
    if (isOnlinePayment && shippingFeePayer === 'SENDER') {
      senderPayAmount += codValue;
      receiverPayAmount = 0;
    }

    const totalOrderValue = codValue + shippingFee;
    const [pickupAddr, deliveryAddr] = await Promise.all([
      this.addressModel.create(dto.pickupAddress),
      this.addressModel.create(dto.deliveryAddress),
    ]);

    const assignedBranchId = await this.resolveBranchForPublicOrder(
      dto.pickupAddress.provinceId,
      dto.pickupAddress.communeId,
    );

    const newOrder = await this.orderModel.create({
      ...dto,
      pickupAddressId: pickupAddr._id,
      deliveryAddressId: deliveryAddr._id,
      userId: null,
      branchId: assignedBranchId,
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
      paymentMethod: dto.paymentMethod || 'CASH',
      channel: OrderChannel.B2C_GUEST,
      senderPhone: this.normalizePhone(dto.senderPhone),
      pickupMethod: dto.pickupMethod || 'DROPOFF',
      pickupSlot: dto.pickupSlot ? new Date(dto.pickupSlot) : null,
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
      branchId: assignedBranchId,
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
          console.warn('Gửi email xác nhận B2C thất bại:', err.message),
        );
    }

    const payment = await this.paymentsService.createPaymentForOrder(
      newOrder._id.toString(),
      {
        method: dto.paymentMethod || 'CASH',
        amount: senderPayAmount || totalOrderValue,
        status: dto.paymentMethod === 'CASH' ? 'paid' : 'pending',
        transactionId: newOrder._id.toString(),
        createdBy: null,
      },
    );

    otpRecord.usedAt = new Date();
    await otpRecord.save();

    // Emit notification for guest/public order if possible (resolve to user id by email/phone)
    try {
      let recipient: string | null = null;

      const emailNorm = this.normalizeEmail(dto.email);
      const receiverPhoneNorm = this.normalizePhone(dto.receiverPhone);
      const senderPhoneNorm = this.normalizePhone(dto.senderPhone);

      if (emailNorm) {
        const found = await this.userModel.findOne({ email: emailNorm }).lean();
        if (found && found._id) recipient = String(found._id);
      }

      if (!recipient && receiverPhoneNorm) {
        const foundByPhone = await this.userModel.findOne({ phone: receiverPhoneNorm }).lean();
        if (foundByPhone && foundByPhone._id) recipient = String(foundByPhone._id);
      }

      if (!recipient && senderPhoneNorm) {
        const foundByPhone = await this.userModel.findOne({ phone: senderPhoneNorm }).lean();
        if (foundByPhone && foundByPhone._id) recipient = String(foundByPhone._id);
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
      } catch (e) {}
    } catch (err) {
      console.warn('Failed to create/send public order notification:', err?.message || err);
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

    if (user?.role !== 'ADMIN') {
      filter.userId = new Types.ObjectId(user._id);
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
      filter.senderName = new RegExp(filter.senderName, 'i');
    if (filter.receiverName)
      filter.receiverName = new RegExp(filter.receiverName, 'i');
    if (filter.receiverPhone)
      filter.receiverPhone = new RegExp(filter.receiverPhone, 'i');
    if (filter.productName)
      filter['items.productName'] = new RegExp(filter.productName, 'i');
    if (filter.search) {
      const regex = new RegExp(filter.search, 'i');
      filter.$or = [
        { _id: regex },
        { receiverName: regex },
        { receiverPhone: regex },
        { senderName: regex },
        { 'items.productName': regex },
      ];
    }

    const page = Number(currentPage) > 0 ? Number(currentPage) : 1;
    const size = Number(limit) > 0 ? Number(limit) : 10;
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
      .exec();

    return { meta: { current: page, pageSize: size, pages, total }, results };
  }

  async findOne(id: string) {
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
      .lean();

    if (!order || order.isDeleted) {
      throw new NotFoundException('Order not found');
    }

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

  async update(id: string, dto: UpdateOrderDto) {
    const order = await this.orderModel.findById(id);
    if (!order || order.isDeleted) {
      throw new NotFoundException('Order not found');
    }

    const hasSnapshot = !!order.snapshotPricingId;
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

    const updateData: any = {
      ...dto,
      shippingFee: newShippingFee,
      totalPrice: (dto.codValue || order.codValue || 0) + newShippingFee,
    };

    // Lưu email nếu có
    if (dto.email) {
      updateData.email = dto.email.trim().toLowerCase();
    }

    delete updateData.pickupAddress;
    delete updateData.deliveryAddress;

    // Nếu thay đổi trạng thái → gọi updateStatus để có tracking và gửi email
    if (dto.status && dto.status !== order.status) {
      return this.updateStatus(id, dto.status as OrderStatus);
    }

    // Cập nhật thông tin đơn hàng
    const updatedOrder = await this.orderModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .populate({
        path: 'pickupAddressId deliveryAddressId',
        populate: { path: 'provinceId communeId' },
      });

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
          console.warn('Gửi email cập nhật đơn hàng thất bại:', err.message),
        );
    }

    return updatedOrder;
  }

  async remove(id: string, user: IUser) {
    const order = await this.orderModel.findById(id);
    if (!order || order.isDeleted)
      throw new NotFoundException('Order not found');

    await this.orderModel.softDelete({ _id: id });
    order.deletedBy = { _id: new Types.ObjectId(user._id), email: user.email };
    await order.save();

    return { message: 'Order soft-deleted' };
  }

  async updateStatus(id: string, status: OrderStatus, user?: IUser) {
    const order = await this.orderModel.findById(id);
    if (!order || order.isDeleted) {
      console.error(`❌ Order ${id} not found or deleted`);
      throw new NotFoundException('Order not found');
    }

    const oldStatus = order.status;
    order.status = status;
    order.updatedAt = new Date();

    await order.save();

    console.log(`🔄 Order ${id} changed from ${oldStatus} to ${status}`);

    // Tạo tracking
    await this.trackingModel.create({
      orderId: order._id,
      status: status,
      timestamp: new Date(),
      location:
        status === OrderStatus.CONFIRMED
          ? 'Bưu cục tiếp nhận (Thanh toán MOMO)'
          : 'Cập nhật trạng thái',
      note:
        status === OrderStatus.CONFIRMED ? 'Thanh toán MOMO thành công' : '',
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
          )}/tracking/${order.waybill}`,
          codValue: order.codValue,
        })
        .catch((err) => console.error(`Gửi email trạng thái thất bại:`, err));
    }

    return order;
  }

  async getStatistics(month?: number, year?: number, user?: IUser | null) {
    const filter: any = { isDeleted: false };

    if (user?._id) {
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
      statusKeys.reduce((acc, k) => {
        (acc as any)[k] = 0;
        return acc;
      }, {} as Record<OrderStatus, number>);

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

  async getStatusById(id: string) {
    const order = await this.orderModel
      .findById(id)
      .select('_id status isDeleted')
      .lean();

    if (!order || order.isDeleted) {
      throw new NotFoundException('Order not found');
    }

    return {
      id: order._id.toString(),
      status: order.status as OrderStatus,
    };
  }

  async confirmPayment(orderId: string) {
    const order = await this.orderModel.findById(orderId);
    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng');
    }

    if (order.paymentMethod !== 'QR') {
      throw new BadRequestException(
        'Chỉ hỗ trợ xác nhận thanh toán cho đơn QR',
      );
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        'Chỉ đơn hàng PENDING mới có thể xác nhận thanh toán',
      );
    }

    order.status = OrderStatus.CONFIRMED;
    order.updatedAt = new Date();
    const updatedOrder = await order.save();

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
      .catch((error) => console.warn('Gửi email confirmed thất bại:', error));

    return {
      success: true,
      message: 'Đơn hàng đã được xác nhận thanh toán thành công',
      order: updatedOrder,
    };
  }

  async findByWaybill(waybill: string) {
    const order = await this.orderModel.findOne({ waybill }).lean();
    if (!order || order.isDeleted) {
      throw new NotFoundException('Không tìm thấy đơn hàng');
    }
    return order;
  }
}
