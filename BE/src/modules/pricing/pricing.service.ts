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

@Injectable()
export class PricingService {
  constructor(
    @InjectModel(Pricing.name)
    private pricingModel: SoftDeleteModel<PricingDocument>,
    @InjectModel(Branch.name) private branchModel: Model<BranchDocument>,
    @InjectModel(Province.name) private provinceModel: Model<Province>,
    @InjectModel(Commune.name) private communeModel: Model<Commune>,
    @InjectModel(Address.name) private addressModel: Model<Address>,
  ) {}

  create(dto: any) {
    return this.pricingModel.create({
      ...dto,
      effectiveFrom: dto.effectiveFrom ?? new Date(),
    });
  }

  async findAll(currentPage = 1, limit = 10, queryObj: any = {}) {
    const { filter, sort, population } = aqp(queryObj);
    delete (filter as any).current;
    delete (filter as any).pageSize;

    if (filter.isDeleted === undefined) (filter as any).isDeleted = false;

    const page = Number(currentPage) > 0 ? Number(currentPage) : 1;
    const size = Number(limit) > 0 ? Number(limit) : 10;
    const skip = (page - 1) * size;

    const total = await this.pricingModel.countDocuments(filter);
    const pages = Math.ceil(total / size);

    const q = this.pricingModel
      .find(filter)
      .sort(sort as any)
      .skip(skip)
      .limit(size);
    if (population) q.populate(population as any);
    const results = await q.exec();

    return { meta: { current: page, pageSize: size, pages, total }, results };
  }

  async findOne(id: string) {
    const doc = await this.pricingModel.findById(id);
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

  // async calculateShipping(
  //   originRegion: 'North' | 'Central' | 'South',
  //   destRegion: 'North' | 'Central' | 'South',
  //   serviceCode: 'STD' | 'EXP',
  //   weightKg: number,
  //   isLocal: boolean,
  // ) {
  //   // Nếu nội thành hoặc gần kho => free ship
  //   if (isLocal) {
  //     return { totalPrice: 0, description: 'Free ship (nội thành/gần kho)' };
  //   }

  //   // Lấy thông tin dịch vụ
  //   const service = await this.pricingModel.findOne({
  //     code: serviceCode,
  //     isActive: true,
  //   });
  //   if (!service) throw new NotFoundException('Service not found');

  //   let baseFee = 0;

  //   // Logic theo vùng
  //   if (
  //     (originRegion === 'North' && destRegion === 'Central') ||
  //     (originRegion === 'Central' && destRegion === 'North')
  //   ) {
  //     baseFee = 10000;
  //   } else if (
  //     (originRegion === 'North' && destRegion === 'South') ||
  //     (originRegion === 'South' && destRegion === 'North')
  //   ) {
  //     baseFee = 15000;
  //   } else if (
  //     (originRegion === 'South' && destRegion === 'Central') ||
  //     (originRegion === 'Central' && destRegion === 'South')
  //   ) {
  //     baseFee = 10000;
  //   }

  //   // Phụ phí > 5kg
  //   const extra = weightKg > 5 ? 5000 : 0;

  //   const totalPrice = baseFee + service.basePrice + extra;

  //   return {
  //     totalPrice,
  //     serviceDescription: service.description,
  //   };
  // }
}
