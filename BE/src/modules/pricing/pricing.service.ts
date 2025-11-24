import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import aqp from 'api-query-params';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import { Model, Types } from 'mongoose';
import { IUser } from 'src/types/user.interface';
import { Pricing, PricingDocument } from './schemas/pricing.schemas';
import { Branch, BranchDocument } from '../branches/schemas/branch.schemas';
import { Province } from '../location/schemas/province.schema';
import { Commune } from '../location/schemas/Commune.schema';
import { Address } from '../location/schemas/address.schema';
import { ProvinceCode, Region } from 'src/types/location.type';
import { getRegionByProvinceCode } from '../location/dto/locations';
import { Service, ServiceDocument } from '../services/schemas/service.schemas';

@Injectable()
export class PricingService {
  constructor(
    @InjectModel(Pricing.name)
    private pricingModel: SoftDeleteModel<PricingDocument>,

    @InjectModel(Branch.name)
    private branchModel: Model<BranchDocument>,

    @InjectModel(Province.name)
    private provinceModel: Model<Province>,

    @InjectModel(Commune.name)
    private communeModel: Model<Commune>,

    @InjectModel(Address.name)
    private addressModel: Model<Address>,

    @InjectModel(Service.name)
    private serviceModel: Model<ServiceDocument>,
  ) {}

  create(dto: any) {
    return this.pricingModel.create({
      ...dto,
      effectiveFrom: dto.effectiveFrom ?? new Date(),
    });
  }

  async findAll(currentPage = 1, limit = 10, queryObj: any = {}) {
    const { filter, sort } = aqp(queryObj);
    delete (filter as any).current;
    delete (filter as any).pageSize;

    if (filter.isDeleted === undefined) (filter as any).isDeleted = false;

    const page = Number(currentPage) > 0 ? Number(currentPage) : 1;
    const size = Number(limit) > 0 ? Number(limit) : 10;
    const skip = (page - 1) * size;

    const total = await this.pricingModel.countDocuments(filter);
    const pages = Math.ceil(total / size);

    const results = await this.pricingModel
      .find(filter)
      .sort(sort as any)
      .skip(skip)
      .limit(size)
      .populate('serviceId')
      .exec();

    return { meta: { current: page, pageSize: size, pages, total }, results };
  }

  async findOne(id: string) {
    const doc = await this.pricingModel.findById(id).populate('serviceId');
    if (!doc || doc.isDeleted) throw new NotFoundException('Pricing not found');
    return doc;
  }

  async update(id: string, dto: any) {
    const doc = await this.pricingModel.findByIdAndUpdate(id, dto, {
      new: true,
    });
    if (!doc || doc.isDeleted) throw new NotFoundException('Pricing not found');
    return doc;
  }

  // Soft delete đúng chuẩn plugin
  async remove(id: string, user?: IUser) {
    const res = await this.pricingModel.softDelete({
      _id: id,
      deletedBy: user?._id
        ? { _id: new Types.ObjectId(user._id), email: user.email }
        : undefined,
    } as any);
    if (!res || (res as any).modifiedCount === 0)
      throw new NotFoundException('Pricing not found');
    return { message: 'Pricing soft-deleted' };
  }

  // ================== HELPER: LẤY PRICING ACTIVE THEO SERVICE CODE ==================
  private async getActivePricingByServiceCode(
    serviceCode: 'STD' | 'EXP',
  ): Promise<PricingDocument> {
    // 1. Tìm service theo code (giả sử schema Service có field "code")
    const svc = await this.serviceModel
      .findOne({ code: serviceCode, isDeleted: { $ne: true } })
      .lean();

    if (!svc) {
      throw new NotFoundException(
        `Service với code ${serviceCode} không tồn tại`,
      );
    }

    const now = new Date();

    // 2. Lấy pricing active theo serviceId + thời gian
    const pricing = await this.pricingModel
      .findOne({
        serviceId: svc._id,
        isActive: true,
        isDeleted: { $ne: true },
        effectiveFrom: { $lte: now },
        $or: [{ effectiveTo: null }, { effectiveTo: { $gte: now } }],
      })
      .sort({ effectiveFrom: -1 })
      .lean();

    if (!pricing) {
      throw new NotFoundException(
        `Không tìm thấy pricing active cho service ${serviceCode}`,
      );
    }

    return pricing as PricingDocument;
  }

  /// ================== TÍNH PHÍ VẬN CHUYỂN (DÙNG PRICING TRONG DB) ==================
  async calculateShipping(
    originProvinceCode: ProvinceCode,
    destProvinceCode: ProvinceCode,
    serviceCode: 'STD' | 'EXP',
    weightKg: number,
    isLocal: boolean,
  ) {
    // Lấy pricing động từ DB (basePrice, overweightThresholdKg, overweightFee)
    const pricing = await this.getActivePricingByServiceCode(serviceCode);

    const threshold = pricing.overweightThresholdKg ?? 0;
    const overweightFee =
      threshold > 0 && weightKg > threshold ? pricing.overweightFee ?? 0 : 0;

    // ========== Nội tỉnh / gần kho ==========
    if (isLocal) {
      return {
        totalPrice: overweightFee,
        description:
          overweightFee > 0
            ? 'Free ship nội thành, chỉ thu phụ phí quá cân'
            : 'Free ship (nội thành/gần kho)',
        breakdown: {
          originProvinceCode,
          destProvinceCode,
          originRegion: null,
          destRegion: null,
          serviceCode,
          pricingId: pricing._id,
          baseServicePrice: 0,
          regionFee: 0,
          overweightFee,
          overweightThresholdKg: threshold,
          isLocal,
        },
      };
    }

    // ========== Liên tỉnh: tính theo vùng + pricing ==========
    const originRegion = getRegionByProvinceCode(originProvinceCode);
    const destRegion = getRegionByProvinceCode(destProvinceCode);

    if (!originRegion || !destRegion) {
      throw new NotFoundException('Province code không hợp lệ');
    }

    let regionFee = 0;
    const pair = new Set<Region>([originRegion, destRegion]);

    if (pair.has('North') && pair.has('Central')) {
      regionFee = 10000;
    } else if (pair.has('North') && pair.has('South')) {
      regionFee = 15000;
    } else if (pair.has('South') && pair.has('Central')) {
      regionFee = 10000;
    }

    const baseServicePrice = pricing.basePrice;
    const totalPrice = baseServicePrice + regionFee + overweightFee;

    return {
      totalPrice,
      breakdown: {
        originProvinceCode,
        destProvinceCode,
        originRegion,
        destRegion,
        serviceCode,
        pricingId: pricing._id,
        baseServicePrice,
        regionFee,
        overweightFee,
        overweightThresholdKg: threshold,
        isLocal,
      },
    };
  }
}
