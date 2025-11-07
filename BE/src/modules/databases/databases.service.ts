import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import { Connection, Types } from 'mongoose';
import { UsersService } from '../users/users.service';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Payment, PaymentDocument } from '../payments/schema/payment.schema';
import { Address, AddressDocument } from '../location/schemas/address.schema';
import { Branch, BranchDocument } from '../branches/schemas/branch.schemas';
import { Service, ServiceDocument } from '../services/schemas/service.schemas';
import { Pricing, PricingDocument } from '../pricing/schemas/pricing.schemas';
import {
  Order,
  OrderDocument,
  OrderStatus,
} from '../orders/schemas/order.schemas';
import {
  Tracking,
  TrackingDocument,
  TrackingStatus,
} from '../tracking/schemas/tracking.schemas';
import {
  Province,
  ProvinceDocument,
} from '../location/schemas/province.schema';
import {
  Shipment,
  ShipmentDocument,
  ShipmentStatus,
} from '../shipments/schemas/shipment.schema';
import {
  NotificationDocument,
  NotificationStatus,
  NotificationType,
} from '../notifications/schemas/notification.schemas';
import { Commune, CommuneDocument } from '../location/schemas/Commune.schema';

/** Lean address type dùng trong seed */
type SeedAddress = {
  _id: Types.ObjectId;
  line1: string;
  lat?: number;
  lng?: number;
  provinceId: Types.ObjectId;
  communeId: Types.ObjectId;
};

@Injectable()
export class DatabasesService implements OnModuleInit {
  private readonly logger = new Logger(DatabasesService.name);

  constructor(
    @InjectModel(User.name)
    private readonly userModel: SoftDeleteModel<UserDocument>,

    @InjectModel(Province.name)
    private readonly provinceModel: SoftDeleteModel<ProvinceDocument>,
    @InjectModel(Commune.name)
    private readonly CommuneModel: SoftDeleteModel<CommuneDocument>,
    @InjectModel(Address.name)
    private readonly addressModel: SoftDeleteModel<AddressDocument>,

    @InjectModel(Branch.name)
    private readonly branchModel: SoftDeleteModel<BranchDocument>,
    @InjectModel(Service.name)
    private readonly serviceModel: SoftDeleteModel<ServiceDocument>,
    @InjectModel(Pricing.name)
    private readonly pricingModel: SoftDeleteModel<PricingDocument>,
    @InjectModel(Order.name)
    private readonly orderModel: SoftDeleteModel<OrderDocument>,
    @InjectModel(Shipment.name)
    private readonly shipmentModel: SoftDeleteModel<ShipmentDocument>,
    @InjectModel(Payment.name)
    private readonly paymentModel: SoftDeleteModel<PaymentDocument>,
    @InjectModel(Tracking.name)
    private readonly trackingModel: SoftDeleteModel<TrackingDocument>,
    @InjectModel('Notification')
    private readonly notificationModel: SoftDeleteModel<NotificationDocument>,

    @InjectConnection() private readonly connection: Connection,
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async onModuleInit() {
    if (this.config.get('SHOULD_INIT') !== 'true') return;

    await this.seedUsers();
    const { hn, hcm } = await this.seedLocation32(); // 32 tỉnh + quận/huyện
    const { addrHn1, addrHcm1, addrHn2 } = await this.seedAddresses(hn, hcm); // địa chỉ lean
    const { branchHN, branchHCM } = await this.seedBranches(addrHn1, addrHcm1);
    const { svcSTD, svcEXP } = await this.seedServices();
    await this.seedPricing(svcSTD._id, svcEXP._id);
    const { order1, customer } = await this.seedOrders(addrHn2, addrHcm1);
    await this.seedShipments(
      order1,
      customer,
      branchHN,
      branchHCM,
      svcSTD,
      addrHn2,
      addrHcm1,
    );
    await this.seedTrackings();
    await this.seedNotifications(customer);

    this.logger.log('DATABASE SEEDING COMPLETED');
  }

  /* ---------------- USERS ---------------- */
  private async seedUsers() {
    if (await this.userModel.countDocuments()) return;

    const hash = this.usersService.getHashPassword(
      this.config.get<string>('INIT_PASSWORD') || '123456',
    );

    await this.userModel.insertMany([
      {
        name: 'Admin',
        email: 'admin@vtpost.local',
        password: hash,
        role: 'ADMIN',
        isActive: true,
      },
      {
        name: 'Staff HN',
        email: 'staff.hn@vtpost.local',
        password: hash,
        role: 'STAFF',
        isActive: true,
      },
      {
        name: 'Courier HCM',
        email: 'courier.hcm@vtpost.local',
        password: hash,
        role: 'COURIER',
        isActive: true,
      },
      {
        name: 'Customer',
        email: 'cus@vtpost.local',
        password: hash,
        role: 'CUSTOMER',
        isActive: true,
      },
    ]);

    this.logger.log('>>> INIT USERS DONE');
  }

  /* ---------------- LOCATION (2 cấp) ---------------- */
  private async seedLocation32() {
    if ((await this.provinceModel.countDocuments()) >= 32) {
      const hn = await this.provinceModel.findOne({ code: 'HN' }).lean();
      const hcm = await this.provinceModel.findOne({ code: 'HCM' }).lean();
      return { hn, hcm };
    }

    type P = {
      code: string;
      name: string;
      Communes: { code: string; name: string }[];
    };

    const PROVINCES_32: P[] = [
      {
        code: 'HN',
        name: 'Thành phố Hà Nội',
        Communes: [
          { code: 'HN-ST', name: 'Phường Sơn Tây' },
          { code: 'HN-SS', name: 'Xã Sóc Sơn' },
          { code: 'HN-DA', name: 'Xã Đông Anh' },
          { code: 'HN-GL', name: 'Xã Gia Lâm' },
          { code: 'HN-TT', name: 'Xã Thanh Trì' },
          { code: 'HN-ML', name: 'Xã Mê Linh' },
          { code: 'HN-HĐ', name: 'Xã Hoài Đức' },
          { code: 'HN-DP', name: 'Xã Đan Phượng' },
          { code: 'HN-PT', name: 'Xã Phúc Thọ' },
          { code: 'HN-BV', name: 'Xã Ba Vì' },
          { code: 'HN-QO', name: 'Xã Quốc Oai' },
          { code: 'HN-TTH', name: 'Xã Thạch Thất' },
          { code: 'HN-CM', name: 'Xã Chương Mỹ' },
          { code: 'HN-TO', name: 'Xã Thanh Oai' },
          { code: 'HN-TTT', name: 'Xã Thường Tín' },
          { code: 'HN-PX', name: 'Xã Phú Xuyên' },
          { code: 'HN-UH', name: 'Xã Ứng Hòa' },
          { code: 'HN-MD', name: 'Xã Mỹ Đức' },
          { code: 'HN-BD', name: 'Phường Ba Đình' },
          { code: 'HN-HK', name: 'Phường Hoàn Kiếm' },
          { code: 'HN-HBT', name: 'Phường Hai Bà Trưng' },
          { code: 'HN-DD', name: 'Phường Đống Đa' },
          { code: 'HN-TH', name: 'Phường Tây Hồ' },
          { code: 'HN-CG', name: 'Phường Cầu Giấy' },
          { code: 'HN-TX', name: 'Phường Thanh Xuân' },
          { code: 'HN-HM', name: 'Phường Hoàng Mai' },
          { code: 'HN-LB', name: 'Phường Long Biên' },
          { code: 'HN-HD', name: 'Phường Hà Đông' },
          { code: 'HN-NTL', name: 'Phường Nam Từ Liêm' },
          { code: 'HN-BTL', name: 'Phường Bắc Từ Liêm' },
        ],
      },

      {
        code: 'HCM',
        name: 'Thành phố Hồ Chí Minh',
        Communes: [
          { code: 'HCM-TD', name: 'Phường Thủ Đức' },
          { code: 'HCM-BC', name: 'Xã Bình Chánh' },
          { code: 'HCM-CC', name: 'Xã Củ Chi' },
          { code: 'HCM-HM', name: 'Xã Hóc Môn' },
          { code: 'HCM-NB', name: 'Xã Nhà Bè' },
          { code: 'HCM-CG', name: 'Xã Cần Giờ' },
          { code: 'HCM-BT', name: 'Phường Bình Thạnh' },
          { code: 'HCM-GV', name: 'Phường Gò Vấp' },
          { code: 'HCM-PN', name: 'Phường Phú Nhuận' },
          { code: 'HCM-TB', name: 'Phường Tân Bình' },
          { code: 'HCM-TP', name: 'Phường Tân Phú' },
          { code: 'HCM-BTAN', name: 'Phường Bình Tân' },
          { code: 'HCM-Q1', name: 'Phường Trung tâm' },
          { code: 'HCM-Q3', name: 'Phường Khu Ba' },
          { code: 'HCM-Q4', name: 'Phường Kênh Tẻ' },
          { code: 'HCM-Q5', name: 'Phường Chợ Lớn' },
          { code: 'HCM-Q6', name: 'Phường Bình Phú' },
          { code: 'HCM-Q7', name: 'Phường Nam Sài Gòn' },
          { code: 'HCM-Q8', name: 'Phường Phú Định' },
          { code: 'HCM-Q10', name: 'Phường Nhật Tảo' },
          { code: 'HCM-Q11', name: 'Phường Bình Thới' },
          { code: 'HCM-Q12', name: 'Phường Hiệp Thành' },
        ],
      },

      {
        code: 'HP',
        name: 'Thành phố Hải Phòng',
        Communes: [
          { code: 'HP-TN', name: 'Xã Thủy Nguyên' },
          { code: 'HP-AD', name: 'Xã An Dương' },
          { code: 'HP-AL', name: 'Xã An Lão' },
          { code: 'HP-KT', name: 'Xã Kiến Thụy' },
          { code: 'HP-TL', name: 'Xã Tiên Lãng' },
          { code: 'HP-VB', name: 'Xã Vĩnh Bảo' },
          { code: 'HP-CH', name: 'Xã Cát Hải' },
          { code: 'HP-BLV', name: 'Xã Bạch Long Vĩ' },
          { code: 'HP-HB', name: 'Phường Hồng Bàng' },
          { code: 'HP-NQ', name: 'Phường Ngô Quyền' },
          { code: 'HP-LC', name: 'Phường Lê Chân' },
          { code: 'HP-HA', name: 'Phường Hải An' },
          { code: 'HP-KA', name: 'Phường Kiến An' },
          { code: 'HP-DS', name: 'Phường Đồ Sơn' },
          { code: 'HP-DK', name: 'Phường Dương Kinh' },
        ],
      },

      {
        code: 'DN',
        name: 'Thành phố Đà Nẵng',
        Communes: [
          { code: 'DN-HA', name: 'Phường Hải Châu' },
          { code: 'DN-ST', name: 'Phường Sơn Trà' },
          { code: 'DN-NHS', name: 'Phường Ngũ Hành Sơn' },
          { code: 'DN-LC', name: 'Phường Liên Chiểu' },
          { code: 'DN-TK', name: 'Phường Thanh Khê' },
          { code: 'DN-CL', name: 'Phường Cẩm Lệ' },
          { code: 'DN-HV', name: 'Xã Hòa Vang' },
          { code: 'DN-HS', name: 'Xã Hoàng Sa' },
        ],
      },

      {
        code: 'CT',
        name: 'Thành phố Cần Thơ',
        Communes: [
          { code: 'CT-NK', name: 'Phường Ninh Kiều' },
          { code: 'CT-BT', name: 'Phường Bình Thủy' },
          { code: 'CT-CR', name: 'Phường Cái Răng' },
          { code: 'CT-OM', name: 'Phường Ô Môn' },
          { code: 'CT-TN', name: 'Phường Thốt Nốt' },

          { code: 'CT-VT', name: 'Xã Vĩnh Thạnh' },
          { code: 'CT-CD', name: 'Xã Cờ Đỏ' },
          { code: 'CT-PD', name: 'Xã Phong Điền' },
          { code: 'CT-TL', name: 'Xã Thới Lai' },
        ],
      },

      {
        code: 'QN',
        name: 'Quảng Ninh',
        Communes: [
          { code: 'QN-HL', name: 'Phường Hạ Long' },
          { code: 'QN-MC', name: 'Phường Móng Cái' },
          { code: 'QN-CP', name: 'Phường Cẩm Phả' },
          { code: 'QN-UB', name: 'Phường Uông Bí' },
          { code: 'QN-DT', name: 'Phường Đông Triều' },
          { code: 'QN-QY', name: 'Phường Quảng Yên' },
          { code: 'QN-BL', name: 'Xã Bình Liêu' },
          { code: 'QN-TY', name: 'Xã Tiên Yên' },
          { code: 'QN-DH', name: 'Xã Đầm Hà' },
          { code: 'QN-HH', name: 'Xã Hải Hà' },
          { code: 'QN-BC', name: 'Xã Ba Chẽ' },
          { code: 'QN-VD', name: 'Xã Vân Đồn' },
          { code: 'QN-CT', name: 'Thị trấn Cô Tô' },
        ],
      },

      {
        code: 'LA',
        name: 'Long An',
        Communes: [
          { code: 'LA-TA', name: 'Phường Tân An' },
          { code: 'LA-KT', name: 'Phường Kiến Tường' },
          { code: 'LA-TH', name: 'Xã Tân Hưng' },
          { code: 'LA-VH', name: 'Xã Vĩnh Hưng' },
          { code: 'LA-MH', name: 'Xã Mộc Hóa' },
          { code: 'LA-TT', name: 'Xã Tân Thạnh' },
          { code: 'LA-THO', name: 'Xã Thạnh Hóa' },
          { code: 'LA-DH', name: 'Xã Đức Huệ' },
          { code: 'LA-DHOA', name: 'Xã Đức Hòa' },
          { code: 'LA-BL', name: 'Xã Bến Lức' },
          { code: 'LA-TTH', name: 'Xã Thủ Thừa' },
          { code: 'LA-TTR', name: 'Xã Tân Trụ' },
          { code: 'LA-CD', name: 'Xã Cần Đước' },
          { code: 'LA-CG', name: 'Xã Cần Giuộc' },
          { code: 'LA-CT', name: 'Xã Châu Thành' },
        ],
      },

      {
        code: 'BD',
        name: 'Bình Dương',
        Communes: [
          { code: 'BD-TDM', name: 'Phường Thủ Dầu Một' },
          { code: 'BD-DA', name: 'Phường Dĩ An' },
          { code: 'BD-TA', name: 'Phường Thuận An' },
          { code: 'BD-BC', name: 'Phường Bến Cát' },
          { code: 'BD-TU', name: 'Phường Tân Uyên' },
          { code: 'BD-BB', name: 'Xã Bàu Bàng' },
          { code: 'BD-DT', name: 'Xã Dầu Tiếng' },
          { code: 'BD-PG', name: 'Xã Phú Giáo' },
          { code: 'BD-BTU', name: 'Thị trấn Bắc Tân Uyên' },
        ],
      },

      {
        code: 'BH',
        name: 'Bình Định',
        Communes: [
          { code: 'BH-QN', name: 'Phường Quy Nhơn' },
          { code: 'BH-HN', name: 'Phường Hoài Nhơn' },
          { code: 'BH-AN', name: 'Phường An Nhơn' },
          { code: 'BH-AL', name: 'Xã An Lão' },
          { code: 'BH-HA', name: 'Xã Hoài Ân' },
          { code: 'BH-PM', name: 'Xã Phù Mỹ' },
          { code: 'BH-VT', name: 'Xã Vĩnh Thạnh' },
          { code: 'BH-TS', name: 'Xã Tây Sơn' },
          { code: 'BH-PC', name: 'Xã Phù Cát' },
          { code: 'BH-TP', name: 'Xã Tuy Phước' },
          { code: 'BH-VC', name: 'Xã Vân Canh' },
        ],
      },
      {
        code: 'NT',
        name: 'Ninh Thuận',
        Communes: [
          { code: 'NT-PR', name: 'Phường Phan Rang - Tháp Chàm' },
          { code: 'NT-BA', name: 'Xã Bác Ái' },
          { code: 'NT-NS', name: 'Xã Ninh Sơn' },
          { code: 'NT-NH', name: 'Xã Ninh Hải' },
          { code: 'NT-NP', name: 'Xã Ninh Phước' },
          { code: 'NT-TB', name: 'Xã Thuận Bắc' },
          { code: 'NT-TN', name: 'Xã Thuận Nam' },
        ],
      },
      {
        code: 'BT',
        name: 'Bình Thuận',
        Communes: [
          { code: 'BT-PT', name: 'Phường Phan Thiết' },
          { code: 'BT-LG', name: 'Phường La Gi' },
          { code: 'BT-TP', name: 'Xã Tuy Phong' },
          { code: 'BT-BB', name: 'Xã Bắc Bình' },
          { code: 'BT-HTB', name: 'Xã Hàm Thuận Bắc' },
          { code: 'BT-HTN', name: 'Xã Hàm Thuận Nam' },
          { code: 'BT-TL', name: 'Xã Tánh Linh' },
          { code: 'BT-DL', name: 'Xã Đức Linh' },
          { code: 'BT-HT', name: 'Xã Hàm Tân' },
          { code: 'BT-PQ', name: 'Thị trấn Phú Quý' },
        ],
      },
      {
        code: 'KH',
        name: 'Khánh Hòa',
        Communes: [
          { code: 'KH-NT', name: 'Phường Nha Trang' },
          { code: 'KH-CR', name: 'Phường Cam Ranh' },
          { code: 'KH-NH', name: 'Phường Ninh Hòa' },
          { code: 'KH-CL', name: 'Xã Cam Lâm' },
          { code: 'KH-VN', name: 'Xã Vạn Ninh' },
          { code: 'KH-KV', name: 'Xã Khánh Vĩnh' },
          { code: 'KH-DK', name: 'Xã Diên Khánh' },
          { code: 'KH-KS', name: 'Xã Khánh Sơn' },
          { code: 'KH-TS', name: 'Thị trấn Trường Sa' },
        ],
      },

      {
        code: 'LD',
        name: 'Lâm Đồng',
        Communes: [
          { code: 'LD-DL', name: 'Phường Đà Lạt' },
          { code: 'LD-BL', name: 'Phường Bảo Lộc' },
          { code: 'LD-DR', name: 'Xã Đam Rông' },
          { code: 'LD-LD', name: 'Xã Lạc Dương' },
          { code: 'LD-LH', name: 'Xã Lâm Hà' },
          { code: 'LD-DD', name: 'Xã Đơn Dương' },
          { code: 'LD-DT', name: 'Xã Đức Trọng' },
          { code: 'LD-DL2', name: 'Xã Di Linh' },
          { code: 'LD-BLM', name: 'Xã Bảo Lâm' },
          { code: 'LD-DH', name: 'Xã Đạ Huoai' },
          { code: 'LD-DT2', name: 'Xã Đạ Tẻh' },
          { code: 'LD-CT', name: 'Xã Cát Tiên' },
        ],
      },

      {
        code: 'GL',
        name: 'Gia Lai',
        Communes: [
          { code: 'GL-PK', name: 'Phường Pleiku' },
          { code: 'GL-AK', name: 'Phường An Khê' },
          { code: 'GL-AP', name: 'Phường Ayun Pa' },
          { code: 'GL-KB', name: 'Xã KBang' },
          { code: 'GL-DD', name: 'Xã Đăk Đoa' },
          { code: 'GL-CP', name: 'Xã Chư Păh' },
          { code: 'GL-IG', name: 'Xã Ia Grai' },
          { code: 'GL-MY', name: 'Xã Mang Yang' },
          { code: 'GL-KC', name: 'Xã Kông Chro' },
          { code: 'GL-DC', name: 'Xã Đức Cơ' },
          { code: 'GL-CPr', name: 'Xã Chư Prông' },
          { code: 'GL-CS', name: 'Xã Chư Sê' },
          { code: 'GL-DP', name: 'Xã Đăk Pơ' },
          { code: 'GL-IP', name: 'Xã Ia Pa' },
          { code: 'GL-KP', name: 'Xã Krông Pa' },
          { code: 'GL-PT', name: 'Xã Phú Thiện' },
          { code: 'GL-CPu', name: 'Xã Chư Pưh' },
        ],
      },

      {
        code: 'DLK',
        name: 'Đắk Lắk',
        Communes: [
          { code: 'DLK-BMT', name: 'Phường Buôn Ma Thuột' },
          { code: 'DLK-BH', name: 'Phường Buôn Hồ' },
          { code: 'DLK-EH', name: 'Xã Ea H’leo' },
          { code: 'DLK-ES', name: 'Xã Ea Súp' },
          { code: 'DLK-BD', name: 'Xã Buôn Đôn' },
          { code: 'DLK-CM', name: 'Xã Cư M’gar' },
          { code: 'DLK-KB', name: 'Xã Krông Búk' },
          { code: 'DLK-KN', name: 'Xã Krông Năng' },
          { code: 'DLK-EK', name: 'Xã Ea Kar' },
          { code: 'DLK-MD', name: 'Xã M’Đrắk' },
          { code: 'DLK-KBO', name: 'Xã Krông Bông' },
          { code: 'DLK-KP', name: 'Xã Krông Pắk' },
          { code: 'DLK-KA', name: 'Xã Krông Ana' },
          { code: 'DLK-LK', name: 'Xã Lắk' },
          { code: 'DLK-CK', name: 'Xã Cư Kuin' },
        ],
      },

      {
        code: 'DNA',
        name: 'Đồng Nai',
        Communes: [
          { code: 'DNA-BH', name: 'Phường Biên Hòa' },
          { code: 'DNA-LK', name: 'Phường Long Khánh' },
          { code: 'DNA-TP', name: 'Xã Tân Phú' },
          { code: 'DNA-VC', name: 'Xã Vĩnh Cửu' },
          { code: 'DNA-DQ', name: 'Xã Định Quán' },
          { code: 'DNA-TB', name: 'Xã Trảng Bom' },
          { code: 'DNA-TN', name: 'Xã Thống Nhất' },
          { code: 'DNA-CM', name: 'Xã Cẩm Mỹ' },
          { code: 'DNA-LT', name: 'Xã Long Thành' },
          { code: 'DNA-XL', name: 'Xã Xuân Lộc' },
          { code: 'DNA-NT', name: 'Xã Nhơn Trạch' },
        ],
      },

      {
        code: 'VT',
        name: 'Bà Rịa - Vũng Tàu',
        Communes: [
          { code: 'VT-VT', name: 'Phường Vũng Tàu' },
          { code: 'VT-BR', name: 'Phường Bà Rịa' },
          { code: 'VT-PM', name: 'Phường Phú Mỹ' },
          { code: 'VT-CDU', name: 'Xã Châu Đức' },
          { code: 'VT-XM', name: 'Xã Xuyên Mộc' },
          { code: 'VT-LD', name: 'Xã Long Điền' },
          { code: 'VT-CD', name: 'Thị trấn Côn Đảo' },
        ],
      },

      {
        code: 'TG',
        name: 'Tiền Giang',
        Communes: [
          { code: 'TG-MT', name: 'Phường Mỹ Tho' },
          { code: 'TG-GC', name: 'Phường Gò Công' },
          { code: 'TG-CL', name: 'Phường Cai Lậy' },
          { code: 'TG-TP', name: 'Xã Tân Phước' },
          { code: 'TG-CB', name: 'Xã Cái Bè' },
          { code: 'TG-CLH', name: 'Xã Cai Lậy' },
          { code: 'TG-CT', name: 'Xã Châu Thành' },
          { code: 'TG-CG', name: 'Xã Chợ Gạo' },
          { code: 'TG-GT', name: 'Xã Gò Công Tây' },
          { code: 'TG-GD', name: 'Xã Gò Công Đông' },
          { code: 'TG-TPO', name: 'Thị trấn Tân Phú Đông' },
        ],
      },

      {
        code: 'AG',
        name: 'An Giang',
        Communes: [
          { code: 'AG-LX', name: 'Phường Long Xuyên' },
          { code: 'AG-CD', name: 'Phường Châu Đốc' },
          { code: 'AG-TC', name: 'Phường Tân Châu' },
          { code: 'AG-AP', name: 'Xã An Phú' },
          { code: 'AG-PT', name: 'Xã Phú Tân' },
          { code: 'AG-CP', name: 'Xã Châu Phú' },
          { code: 'AG-TB', name: 'Xã Tịnh Biên' },
          { code: 'AG-TT', name: 'Xã Tri Tôn' },
          { code: 'AG-CT', name: 'Xã Châu Thành' },
          { code: 'AG-CM', name: 'Xã Chợ Mới' },
          { code: 'AG-TS', name: 'Xã Thoại Sơn' },
        ],
      },

      {
        code: 'KG',
        name: 'Kiên Giang',
        Communes: [
          { code: 'KG-RG', name: 'Phường Rạch Giá' },
          { code: 'KG-HT', name: 'Phường Hà Tiên' },
          { code: 'KG-PQ', name: 'Phường Phú Quốc' },
          { code: 'KG-KL', name: 'Xã Kiên Lương' },
          { code: 'KG-HD', name: 'Xã Hòn Đất' },
          { code: 'KG-TH', name: 'Xã Tân Hiệp' },
          { code: 'KG-CT', name: 'Xã Châu Thành' },
          { code: 'KG-GR', name: 'Xã Giồng Riềng' },
          { code: 'KG-GQ', name: 'Xã Gò Quao' },
          { code: 'KG-AB', name: 'Xã An Biên' },
          { code: 'KG-AM', name: 'Xã An Minh' },
          { code: 'KG-VT', name: 'Xã Vĩnh Thuận' },
          { code: 'KG-KH', name: 'Xã Kiên Hải' },
          { code: 'KG-UMT', name: 'Xã U Minh Thượng' },
          { code: 'KG-GT', name: 'Xã Giang Thành' },
        ],
      },

      {
        code: 'ST',
        name: 'Sóc Trăng',
        Communes: [
          { code: 'ST-ST', name: 'Phường Sóc Trăng' },
          { code: 'ST-NN', name: 'Phường Ngã Năm' },
          { code: 'ST-VC', name: 'Phường Vĩnh Châu' },
          { code: 'ST-CT', name: 'Xã Châu Thành' },
          { code: 'ST-KS', name: 'Xã Kế Sách' },
          { code: 'ST-MT', name: 'Xã Mỹ Tú' },
          { code: 'ST-CLD', name: 'Xã Cù Lao Dung' },
          { code: 'ST-LP', name: 'Xã Long Phú' },
          { code: 'ST-MX', name: 'Xã Mỹ Xuyên' },
          { code: 'ST-TT', name: 'Xã Thạnh Trị' },
          { code: 'ST-TD', name: 'Xã Trần Đề' },
        ],
      },

      {
        code: 'TV',
        name: 'Trà Vinh',
        Communes: [
          { code: 'TV-TV', name: 'Phường Trà Vinh' },
          { code: 'TV-DH', name: 'Phường Duyên Hải' },
          { code: 'TV-CL', name: 'Xã Càng Long' },
          { code: 'TV-CK', name: 'Xã Cầu Kè' },
          { code: 'TV-TC', name: 'Xã Tiểu Cần' },
          { code: 'TV-CT', name: 'Xã Châu Thành' },
          { code: 'TV-CN', name: 'Xã Cầu Ngang' },
          { code: 'TV-TC2', name: 'Xã Trà Cú' },
          { code: 'TV-DH2', name: 'Xã Duyên Hải' },
        ],
      },

      {
        code: 'VLong',
        name: 'Vĩnh Long',
        Communes: [
          { code: 'VL-VL', name: 'Phường Vĩnh Long' },
          { code: 'VL-BM', name: 'Phường Bình Minh' },
          { code: 'VL-LH', name: 'Xã Long Hồ' },
          { code: 'VL-MT', name: 'Xã Mang Thít' },
          { code: 'VL-VL2', name: 'Xã Vũng Liêm' },
          { code: 'VL-TB', name: 'Xã Tam Bình' },
          { code: 'VL-TO', name: 'Xã Trà Ôn' },
          { code: 'VL-BT', name: 'Xã Bình Tân' },
        ],
      },

      {
        code: 'BL',
        name: 'Bạc Liêu',
        Communes: [
          { code: 'BL-BL', name: 'Phường Bạc Liêu' },
          { code: 'BL-GR', name: 'Phường Giá Rai' },
          { code: 'BL-HD', name: 'Xã Hồng Dân' },
          { code: 'BL-PL', name: 'Xã Phước Long' },
          { code: 'BL-VL', name: 'Xã Vĩnh Lợi' },
          { code: 'BL-DH', name: 'Xã Đông Hải' },
          { code: 'BL-HB', name: 'Xã Hòa Bình' },
        ],
      },

      {
        code: 'CM',
        name: 'Cà Mau',
        Communes: [
          { code: 'CM-CM', name: 'Phường Cà Mau' },
          { code: 'CM-UM', name: 'Xã U Minh' },
          { code: 'CM-TB', name: 'Xã Thới Bình' },
          { code: 'CM-TVT', name: 'Xã Trần Văn Thời' },
          { code: 'CM-CN', name: 'Xã Cái Nước' },
          { code: 'CM-DD', name: 'Xã Đầm Dơi' },
          { code: 'CM-NC', name: 'Xã Năm Căn' },
          { code: 'CM-PT', name: 'Xã Phú Tân' },
          { code: 'CM-NH', name: 'Xã Ngọc Hiển' },
        ],
      },

      {
        code: 'TH',
        name: 'Thanh Hóa',
        Communes: [
          { code: 'TH-TP', name: 'Phường Thanh Hóa' },
          { code: 'TH-SS', name: 'Phường Sầm Sơn' },
          { code: 'TH-BS', name: 'Phường Bỉm Sơn' },
          { code: 'TH-NS', name: 'Phường Nghi Sơn' },
          { code: 'TH-ML', name: 'Xã Mường Lát' },
          { code: 'TH-QH', name: 'Xã Quan Hóa' },
          { code: 'TH-BT', name: 'Xã Bá Thước' },
          { code: 'TH-QS', name: 'Xã Quan Sơn' },
          { code: 'TH-LC', name: 'Xã Lang Chánh' },
          { code: 'TH-NL', name: 'Xã Ngọc Lặc' },
          { code: 'TH-CT', name: 'Xã Cẩm Thủy' },
          { code: 'TH-TT', name: 'Xã Thạch Thành' },
          { code: 'TH-HT', name: 'Xã Hà Trung' },
          { code: 'TH-VL', name: 'Xã Vĩnh Lộc' },
          { code: 'TH-YD', name: 'Xã Yên Định' },
          { code: 'TH-TX', name: 'Xã Thọ Xuân' },
          { code: 'TH-TXU', name: 'Xã Thường Xuân' },
          { code: 'TH-TS', name: 'Xã Triệu Sơn' },
          { code: 'TH-TH', name: 'Xã Thiệu Hóa' },
          { code: 'TH-HH', name: 'Xã Hoằng Hóa' },
          { code: 'TH-HL', name: 'Xã Hậu Lộc' },
          { code: 'TH-NSO', name: 'Xã Nga Sơn' },
          { code: 'TH-NX', name: 'Xã Như Xuân' },
          { code: 'TH-NT', name: 'Xã Như Thanh' },
          { code: 'TH-NC', name: 'Xã Nông Cống' },
          { code: 'TH-DS', name: 'Xã Đông Sơn' },
          { code: 'TH-QX', name: 'Xã Quảng Xương' },
        ],
      },

      {
        code: 'NA',
        name: 'Nghệ An',
        Communes: [
          { code: 'NA-VI', name: 'Phường Vinh' },
          { code: 'NA-CL', name: 'Phường Cửa Lò' },
          { code: 'NA-TH', name: 'Phường Thái Hòa' },
          { code: 'NA-HM', name: 'Phường Hoàng Mai' },
          { code: 'NA-QP', name: 'Xã Quế Phong' },
          { code: 'NA-QC', name: 'Xã Quỳ Châu' },
          { code: 'NA-KS', name: 'Xã Kỳ Sơn' },
          { code: 'NA-TD', name: 'Xã Tương Dương' },
          { code: 'NA-ND', name: 'Xã Nghĩa Đàn' },
          { code: 'NA-QH', name: 'Xã Quỳ Hợp' },
          { code: 'NA-QL', name: 'Xã Quỳnh Lưu' },
          { code: 'NA-CC', name: 'Xã Con Cuông' },
          { code: 'NA-TK', name: 'Xã Tân Kỳ' },
          { code: 'NA-AS', name: 'Xã Anh Sơn' },
          { code: 'NA-DC', name: 'Xã Diễn Châu' },
          { code: 'NA-YT', name: 'Xã Yên Thành' },
          { code: 'NA-DL', name: 'Xã Đô Lương' },
          { code: 'NA-TC', name: 'Xã Thanh Chương' },
          { code: 'NA-NL', name: 'Xã Nghi Lộc' },
          { code: 'NA-ND2', name: 'Xã Nam Đàn' },
          { code: 'NA-HN', name: 'Xã Hưng Nguyên' },
        ],
      },

      {
        code: 'HT',
        name: 'Hà Tĩnh',
        Communes: [
          { code: 'HT-HT', name: 'Phường Hà Tĩnh' },
          { code: 'HT-HL', name: 'Phường Hồng Lĩnh' },
          { code: 'HT-KA', name: 'Phường Kỳ Anh' },
          { code: 'HT-HS', name: 'Xã Hương Sơn' },
          { code: 'HT-DT', name: 'Xã Đức Thọ' },
          { code: 'HT-VQ', name: 'Xã Vũ Quang' },
          { code: 'HT-NX', name: 'Xã Nghi Xuân' },
          { code: 'HT-CL', name: 'Xã Can Lộc' },
          { code: 'HT-HK', name: 'Xã Hương Khê' },
          { code: 'HT-TH', name: 'Xã Thạch Hà' },
          { code: 'HT-CX', name: 'Xã Cẩm Xuyên' },
          { code: 'HT-KA2', name: 'Xã Kỳ Anh' },
          { code: 'HT-LH', name: 'Xã Lộc Hà' },
        ],
      },

      {
        code: 'QB',
        name: 'Quảng Bình',
        Communes: [
          { code: 'QB-DH', name: 'Phường Đồng Hới' },
          { code: 'QB-BD', name: 'Phường Ba Đồn' },
          { code: 'QB-MH', name: 'Xã Minh Hóa' },
          { code: 'QB-TH', name: 'Xã Tuyên Hóa' },
          { code: 'QB-QT', name: 'Xã Quảng Trạch' },
          { code: 'QB-BT', name: 'Xã Bố Trạch' },
          { code: 'QB-QN', name: 'Xã Quảng Ninh' },
          { code: 'QB-LT', name: 'Xã Lệ Thủy' },
        ],
      },

      {
        code: 'TTH',
        name: 'Thừa Thiên Huế',
        Communes: [
          { code: 'TTH-H', name: 'Phường Huế' },
          { code: 'TTH-HT', name: 'Phường Hương Thủy' },
          { code: 'TTH-HTr', name: 'Phường Hương Trà' },
          { code: 'TTH-PD', name: 'Xã Phong Điền' },
          { code: 'TTH-QD', name: 'Xã Quảng Điền' },
          { code: 'TTH-PV', name: 'Xã Phú Vang' },
          { code: 'TTH-AL', name: 'Xã A Lưới' },
          { code: 'TTH-PL', name: 'Xã Phú Lộc' },
          { code: 'TTH-ND', name: 'Xã Nam Đông' },
        ],
      },
      {
        code: 'PY',
        name: 'Phú Yên',
        Communes: [
          { code: 'PY-TY', name: 'Phường Tuy Hòa' },
          { code: 'PY-SC', name: 'Phường Sông Cầu' },
          { code: 'PY-DH', name: 'Phường Đông Hòa' },
          { code: 'PY-DX', name: 'Xã Đồng Xuân' },
          { code: 'PY-TA', name: 'Xã Tuy An' },
          { code: 'PY-SH', name: 'Xã Sơn Hòa' },
          { code: 'PY-SHi', name: 'Xã Sông Hinh' },
          { code: 'PY-TH', name: 'Xã Tây Hòa' },
          { code: 'PY-PH', name: 'Xã Phú Hòa' },
        ],
      },
      {
        code: 'BDP',
        name: 'Bình Phước',
        Communes: [
          { code: 'BDP-DX', name: 'Phường Đồng Xoài' },
          { code: 'BDP-PL', name: 'Phường Phước Long' },
          { code: 'BDP-BL', name: 'Phường Bình Long' },
          { code: 'BDP-CT', name: 'Phường Chơn Thành' },
          { code: 'BDP-BGM', name: 'Xã Bù Gia Mập' },
          { code: 'BDP-LN', name: 'Xã Lộc Ninh' },
          { code: 'BDP-BD', name: 'Xã Bù Đốp' },
          { code: 'BDP-HQ', name: 'Xã Hớn Quản' },
          { code: 'BDP-DP', name: 'Xã Đồng Phú' },
          { code: 'BDP-BDG', name: 'Xã Bù Đăng' },
          { code: 'BDP-PR', name: 'Xã Phú Riềng' },
        ],
      },
    ];

    await this.provinceModel
      .insertMany(
        PROVINCES_32.map((p) => ({
          code: p.code,
          name: p.name,
          isActive: true,
        })),
        { ordered: false },
      )
      .catch(() => []);

    const allProvinces = await this.provinceModel
      .find({ code: { $in: PROVINCES_32.map((p) => p.code) } })
      .lean();

    const mapId = new Map(
      allProvinces.map((p) => [p.code, p._id as Types.ObjectId]),
    );

    const Communes = PROVINCES_32.flatMap((p) =>
      p.Communes.map((d) => ({
        code: d.code,
        name: d.name,
        provinceId: mapId.get(p.code)!,
        isActive: true,
      })),
    );

    await this.CommuneModel.insertMany(Communes, { ordered: false }).catch(
      () => [],
    );

    const hn = await this.provinceModel.findOne({ code: 'HN' }).lean();
    const hcm = await this.provinceModel.findOne({ code: 'HCM' }).lean();

    this.logger.log(
      `>>> INIT LOCATION 32 PROVINCES DONE (provinces: ${allProvinces.length})`,
    );
    return { hn, hcm };
  }

  /* ---------------- ADDRESSES (no ward) ---------------- */
  private async getOrCreateAddressByCodes(opts: {
    contactName: string;
    contactPhone: string;
    line1: string;
    provinceCode: string;
    CommuneCode: string;
    lat?: number;
    lng?: number;
  }): Promise<SeedAddress> {
    // 1) Có sẵn thì dùng (và đảm bảo line1 không rỗng)
    const existed = await this.addressModel.findOne({
      contactName: opts.contactName,
    });
    if (existed) {
      if (!existed.line1 || !existed.line1.trim()) {
        existed.line1 = opts.line1;
        await existed.save();
      }
      return this.toSeedAddress(existed);
    }

    // 2) Resolve id tỉnh/quận theo code
    const prov = await this.provinceModel
      .findOne({ code: opts.provinceCode })
      .lean();
    if (!prov?._id) throw new Error(`Missing province ${opts.provinceCode}`);

    const dist = await this.CommuneModel.findOne({
      code: opts.CommuneCode,
      provinceId: prov._id,
    }).lean();
    if (!dist?._id)
      throw new Error(
        `Missing Commune ${opts.CommuneCode} of ${opts.provinceCode}`,
      );

    // 3) Tạo mới -> trả về lean ngay
    const [created] = await this.addressModel.insertMany([
      {
        line1: opts.line1,
        provinceId: prov._id,
        communeId: dist._id,
        lat: opts.lat ?? 0,
        lng: opts.lng ?? 0,
        contactName: opts.contactName,
        contactPhone: opts.contactPhone,
      },
    ]);

    return this.toSeedAddress(created);
  }

  private async seedAddresses(
    _hn: any,
    _hcm: any,
  ): Promise<{
    addrHn1: SeedAddress;
    addrHcm1: SeedAddress;
    addrHn2: SeedAddress;
  }> {
    const addrHn1 = await this.getOrCreateAddressByCodes({
      contactName: 'Kho HN',
      contactPhone: '0123456789',
      line1: '123 Tràng Tiền',
      provinceCode: 'HN',
      CommuneCode: 'HN-HK',
      lat: 21.027763,
      lng: 105.83416,
    });

    const addrHcm1 = await this.getOrCreateAddressByCodes({
      contactName: 'Kho HCM',
      contactPhone: '0987654321',
      line1: '45 Lê Lợi',
      provinceCode: 'HCM',
      CommuneCode: 'HCM-Q1',
      lat: 10.776889,
      lng: 106.700806,
    });

    const addrHn2 = await this.getOrCreateAddressByCodes({
      contactName: 'Khách HN',
      contactPhone: '0909009009',
      line1: '25 Hàng Bài',
      provinceCode: 'HN',
      CommuneCode: 'HN-HK',
      lat: 21.0245,
      lng: 105.8542,
    });

    return { addrHn1, addrHcm1, addrHn2 };
  }

  /* ---------------- BRANCHES ---------------- */
  private async seedBranches(addrHn: SeedAddress, addrHcm: SeedAddress) {
    if (await this.branchModel.countDocuments()) {
      const branches = await this.branchModel.find().limit(2);
      return { branchHN: branches[0], branchHCM: branches[1] };
    }

    const branches = [
      {
        code: 'HN01',
        name: 'Hà Nội Center',
        address: addrHn.line1 ?? '123 Tràng Tiền, Hoàn Kiếm',
        city: 'Hà Nội',
        province: 'Hà Nội',
        postalCode: '100000',
        phone: '024-000-000',
        isActive: true,
      },
      {
        code: 'HCM01',
        name: 'HCM Center',
        address: addrHcm.line1 ?? '456 Lê Lợi, Quận 1',
        city: 'Hồ Chí Minh',
        province: 'Hồ Chí Minh',
        postalCode: '700000',
        phone: '028-000-000',
        isActive: true,
      },
      {
        code: 'DN01',
        name: 'Đà Nẵng Center',
        address: '99 Hùng Vương, Hải Châu',
        city: 'Đà Nẵng',
        province: 'Đà Nẵng',
        postalCode: '550000',
        phone: '0236-000-000',
        isActive: true,
      },
      {
        code: 'HP01',
        name: 'Hải Phòng Hub',
        address: '88 Điện Biên Phủ, Ngô Quyền',
        city: 'Hải Phòng',
        province: 'Hải Phòng',
        postalCode: '180000',
        phone: '0225-000-000',
        isActive: true,
      },
      {
        code: 'CT01',
        name: 'Cần Thơ Hub',
        address: '77 Hòa Bình, Ninh Kiều',
        city: 'Cần Thơ',
        province: 'Cần Thơ',
        postalCode: '900000',
        phone: '0292-000-000',
        isActive: true,
      },
      {
        code: 'KH01',
        name: 'Nha Trang Hub',
        address: '66 Trần Phú, Nha Trang',
        city: 'Nha Trang',
        province: 'Khánh Hòa',
        postalCode: '650000',
        phone: '0258-000-000',
        isActive: true,
      },
      {
        code: 'BD01',
        name: 'Bình Dương Center',
        address: '12 Đại Lộ Bình Dương, Thủ Dầu Một',
        city: 'Thủ Dầu Một',
        province: 'Bình Dương',
        postalCode: '590000',
        phone: '0274-000-000',
        isActive: true,
      },
      {
        code: 'DN02',
        name: 'Biên Hòa Hub',
        address: '55 Võ Thị Sáu, Biên Hòa',
        city: 'Biên Hòa',
        province: 'Đồng Nai',
        postalCode: '810000',
        phone: '0251-000-000',
        isActive: true,
      },
      {
        code: 'TH01',
        name: 'Thanh Hóa Hub',
        address: '33 Lê Hoàn, Thanh Hóa',
        city: 'Thanh Hóa',
        province: 'Thanh Hóa',
        postalCode: '440000',
        phone: '0237-000-000',
        isActive: true,
      },
      {
        code: 'NA01',
        name: 'Vinh Hub',
        address: '22 Trường Thi, Vinh',
        city: 'Vinh',
        province: 'Nghệ An',
        postalCode: '460000',
        phone: '0238-000-000',
        isActive: true,
      },
      {
        code: 'HU01',
        name: 'Huế Center',
        address: '45 Hùng Vương, Huế',
        city: 'Huế',
        province: 'Thừa Thiên Huế',
        postalCode: '530000',
        phone: '0234-000-000',
        isActive: true,
      },
      {
        code: 'QN01',
        name: 'Quảng Ninh Hub',
        address: '11 Trần Hưng Đạo, Hạ Long',
        city: 'Hạ Long',
        province: 'Quảng Ninh',
        postalCode: '200000',
        phone: '0203-000-000',
        isActive: true,
      },
    ];

    const inserted = await this.branchModel.insertMany(branches);
    this.logger.log('>>> INIT BRANCHES DONE (12 records)');

    // Return 2 chính để seed shipment
    const branchHN = inserted.find((b) => b.code === 'HN01')!;
    const branchHCM = inserted.find((b) => b.code === 'HCM01')!;
    return { branchHN, branchHCM };
  }

  /* ---------------- SERVICES ---------------- */
  private async seedServices() {
    if (await this.serviceModel.countDocuments()) {
      const svcSTD = await this.serviceModel.findOne({ code: 'STD' });
      const svcEXP = await this.serviceModel.findOne({ code: 'EXP' });
      return { svcSTD, svcEXP };
    }

    const [svcSTD] = await this.serviceModel.insertMany([
      {
        code: 'STD',
        name: 'Tiêu chuẩn',
        description: '3–5 ngày',
        basePrice: 20000,
        isActive: true,
      },
    ]);

    const [svcEXP] = await this.serviceModel.insertMany([
      {
        code: 'EXP',
        name: 'Nhanh',
        description: '1–2 ngày',
        basePrice: 40000,
        isActive: true,
      },
    ]);

    this.logger.log('>>> INIT SERVICES DONE');
    return { svcSTD, svcEXP };
  }

  /* ---------------- PRICING ---------------- */
  private async seedPricing(
    svcSTDId: Types.ObjectId,
    svcEXPId: Types.ObjectId,
  ) {
    if (await this.pricingModel.countDocuments()) return;

    await this.pricingModel.insertMany([
      // STD
      {
        serviceId: svcSTDId,
        minWeightKg: 0,
        maxWeightKg: 2,
        minKm: 0,
        maxKm: 5,
        baseFee: 15000,
        perKm: 1000,
        perKg: 2000,
      },
      {
        serviceId: svcSTDId,
        minWeightKg: 0,
        maxWeightKg: 2,
        minKm: 5,
        maxKm: 30,
        baseFee: 20000,
        perKm: 1200,
        perKg: 2500,
      },
      {
        serviceId: svcSTDId,
        minWeightKg: 2,
        maxWeightKg: 10,
        minKm: 0,
        maxKm: 30,
        baseFee: 30000,
        perKm: 1500,
        perKg: 2500,
      },
      // EXP
      {
        serviceId: svcEXPId,
        minWeightKg: 0,
        maxWeightKg: 2,
        minKm: 0,
        maxKm: 5,
        baseFee: 25000,
        perKm: 1500,
        perKg: 3000,
      },
      {
        serviceId: svcEXPId,
        minWeightKg: 0,
        maxWeightKg: 2,
        minKm: 5,
        maxKm: 30,
        baseFee: 35000,
        perKm: 1800,
        perKg: 3500,
      },
      {
        serviceId: svcEXPId,
        minWeightKg: 2,
        maxWeightKg: 10,
        minKm: 0,
        maxKm: 30,
        baseFee: 45000,
        perKm: 2000,
        perKg: 3500,
      },
    ]);

    this.logger.log('>>> INIT PRICING DONE');
  }

  /* ---------------- ORDERS (no embedded address) ---------------- */
  private async seedOrders(
    pickupAddr: SeedAddress,
    deliveryAddr: SeedAddress,
  ): Promise<{ order1: OrderDocument; customer: UserDocument }> {
    // Nếu đã có order thì dùng lại
    if (await this.orderModel.countDocuments()) {
      const customer = await this.userModel.findOne({ role: 'CUSTOMER' });
      const order1 = await this.orderModel.findOne({ userId: customer?._id });
      return { order1, customer };
    }

    const customer = await this.userModel.findOne({ role: 'CUSTOMER' });
    if (!customer) throw new Error('No CUSTOMER user to seed orders');

    if (!pickupAddr?._id)
      throw new Error('seedOrders: pickupAddressId is empty');
    if (!deliveryAddr?._id)
      throw new Error('seedOrders: deliveryAddressId is empty');

    // Bổ sung line1 nếu thiếu (giúp hiển thị/in tem)
    await Promise.all([
      this.ensureLine1(pickupAddr),
      this.ensureLine1(deliveryAddr),
    ]);

    const [order1] = await this.orderModel.insertMany([
      {
        userId: customer._id,
        senderName: 'Nguyễn Văn A',
        receiverName: 'Trần Thị B',
        receiverPhone: '0912345678',
        pickupAddressId: new Types.ObjectId(pickupAddr._id),
        deliveryAddressId: new Types.ObjectId(deliveryAddr._id),
        totalPrice: 120000,
        status: OrderStatus.PENDING,
      },
    ]);

    this.logger.log('>>> INIT ORDERS DONE');
    return { order1, customer };
  }

  /* ---------------- SHIPMENTS ---------------- */
  private async seedShipments(
    order1: OrderDocument,
    customer: UserDocument,
    branchHN: BranchDocument,
    branchHCM: BranchDocument,
    svcSTD: ServiceDocument,
    pickupAddr: SeedAddress,
    deliveryAddr: SeedAddress,
  ) {
    if (await this.shipmentModel.countDocuments()) return;

    // 1) Tính khoảng cách
    const km = this.haversineKm(
      pickupAddr.lat ?? 0,
      pickupAddr.lng ?? 0,
      deliveryAddr.lat ?? 0,
      deliveryAddr.lng ?? 0,
    );

    // 2) Chọn bảng giá phù hợp
    const now = new Date();
    const slab = await this.pricingModel
      .findOne({
        serviceId: svcSTD._id,
        isActive: true,
        isDeleted: false,
        minWeightKg: { $lte: 1.5 },
        maxWeightKg: { $gte: 1.5 },
        minKm: { $lte: km },
        maxKm: { $gte: km },
        $and: [
          {
            $or: [
              { effectiveFrom: { $exists: false } },
              { effectiveFrom: { $lte: now } },
            ],
          },
          {
            $or: [
              { effectiveTo: null },
              { effectiveTo: { $exists: false } },
              { effectiveTo: { $gte: now } },
            ],
          },
        ],
      })
      .lean();

    const fee = slab
      ? Math.round(
          (slab.baseFee ?? 0) +
            (slab.perKm ?? 0) * km +
            (slab.perKg ?? 0) * 1.5,
        )
      : 30000;

    // 3) Tạo shipment
    const [shipment] = await this.shipmentModel.insertMany([
      {
        trackingNumber: 'VNSEED001',
        senderName: 'Nguyễn Văn A',
        senderPhone: '0909090909',
        receiverName: 'Trần Thị B',
        receiverPhone: '0911222333',
        pickupAddressId: pickupAddr._id,
        deliveryAddressId: deliveryAddr._id,
        originBranchId: branchHN._id,
        destinationBranchId: branchHCM._id,
        serviceId: svcSTD._id,
        weightKg: 1.5,
        chargeableWeightKg: 1.5,
        distanceKm: km,
        shippingFee: fee,
        status: ShipmentStatus.PENDING,
        createdBy: customer._id as Types.ObjectId,
        timeline: [
          {
            status: ShipmentStatus.PENDING,
            timestamp: new Date(),
            note: 'Đơn tạo (seed)',
          },
          {
            status: ShipmentStatus.IN_TRANSIT,
            timestamp: new Date(),
            note: 'Đang trung chuyển',
          },
        ],
      },
    ]);

    // 4) Payment (snapshot theo shipment)
    await this.paymentModel.insertMany([
      {
        orderId: order1._id,
        shipmentId: shipment._id,
        userId: customer._id,
        method: 'COD',
        amount: fee,
        status: 'pending',
        provider: 'seed',
      },
    ]);

    this.logger.log('>>> INIT SHIPMENTS & PAYMENTS DONE');
  }

  /* ---------------- TRACKINGS ---------------- */
  private async seedTrackings() {
    if (await this.trackingModel.countDocuments()) return;

    const shipment = await this.shipmentModel.findOne();
    if (!shipment) return;

    await this.trackingModel.insertMany([
      {
        shipmentId: shipment._id,
        status: TrackingStatus.CREATED,
        location: 'Hà Nội Center',
        note: 'Khởi tạo',
        branchId: shipment.originBranchId,
        timestamp: new Date(),
        createdBy: { _id: new Types.ObjectId(), email: 'system@vtpost.local' },
      },
      {
        shipmentId: shipment._id,
        status: TrackingStatus.IN_TRANSIT,
        location: 'Kho trung chuyển',
        note: 'Đang trung chuyển',
        branchId: shipment.originBranchId,
        timestamp: new Date(),
        createdBy: { _id: new Types.ObjectId(), email: 'system@vtpost.local' },
      },
    ]);

    this.logger.log('>>> INIT TRACKINGS DONE');
  }

  /* ---------------- NOTIFICATIONS ---------------- */
  private async seedNotifications(customer: UserDocument) {
    if (await this.notificationModel.countDocuments()) return;

    await this.notificationModel.insertMany([
      {
        recipient: customer.email,
        title: 'Chào mừng',
        message: 'Tài khoản đã kích hoạt.',
        type: NotificationType.EMAIL,
        status: NotificationStatus.SENT,
      },
      {
        recipient: customer.email,
        title: 'Thông báo vận đơn',
        message: 'Vận đơn VNSEED001 đã được khởi tạo.',
        type: NotificationType.EMAIL,
        status: NotificationStatus.PENDING,
      },
    ]);

    this.logger.log('>>> INIT NOTIFICATIONS DONE');
  }

  /* ---------------- helpers ---------------- */
  private haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private async ensureLine1(addr: any): Promise<any> {
    if (addr?.line1 && addr.line1.trim().length > 0) return addr;

    const [Commune, province] = await Promise.all([
      this.CommuneModel.findById(addr.communeId).lean(),
      this.provinceModel.findById(addr.provinceId).lean(),
    ]);

    const fallback = [
      Commune?.name || 'Quận/Huyện',
      province?.name || 'Tỉnh/Thành',
    ].join(', ');

    await this.addressModel.updateOne(
      { _id: addr._id },
      { $set: { line1: fallback } },
    );

    return { ...addr, line1: fallback };
  }

  private toSeedAddress(a: any): SeedAddress {
    const obj = typeof a?.toObject === 'function' ? a.toObject() : a || {};
    return {
      _id: obj._id as Types.ObjectId,
      line1: (obj.line1 as string) || '',
      lat: obj.lat,
      lng: obj.lng,
      provinceId: obj.provinceId as Types.ObjectId,
      communeId: obj.communeId as Types.ObjectId,
    };
  }
}
