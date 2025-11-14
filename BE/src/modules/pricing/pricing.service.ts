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

  // Tính phí theo km + cân nặng
  // Tính phí theo khoảng cách và cân nặng
  async calculateShipping(branchCode: string, km: number, weightKg: number) {
    // Kiểm tra các điều kiện miễn phí giao hàng
    if (weightKg < 5 || this.isInCity(branchCode, km)) {
      return 0; // Miễn phí ship nếu cân nặng dưới 5kg hoặc đơn hàng gần chi nhánh
    }

    // Tính phí theo bảng giá
    const serviceId = 'serviceId123'; // ID dịch vụ (có thể thay đổi tùy vào yêu cầu)
    const fee = await this.calculateShipping(serviceId, km, weightKg);
    return fee;
  }

  // Kiểm tra xem đơn hàng có thuộc nội thành hoặc gần chi nhánh không
  isInCity(branchCode: string, km: number): boolean {
    const branchesNearby = [
      'HN01',
      'HCM01',
      'DN01',
      'HP01',
      'CT01',
      'KH01',
      'DN02',
      'TH01',
      'NA01',
      'HU01',
      'QN01',
    ]; // Các chi nhánh thuộc nội thành hoặc gần

    // Giả sử khoảng cách nhỏ hơn 10km được coi là gần
    const nearbyDistance = 10;

    // Nếu chi nhánh gần và khoảng cách nhỏ hơn giới hạn, miễn phí ship
    return branchesNearby.includes(branchCode) && km <= nearbyDistance;
  }
}
