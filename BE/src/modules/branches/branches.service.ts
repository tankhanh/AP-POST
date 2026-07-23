import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import aqp from 'api-query-params';
import { Model } from 'mongoose';
import { Branch, BranchDocument } from './schemas/branch.schemas';

@Injectable()
export class BranchesService {
  constructor(
    @InjectModel(Branch.name)
    private branchModel: Model<BranchDocument>,
  ) {}

  async create(dto: any) {
    return this.branchModel.create(dto);
  }

  async findAll(currentPage = 1, limit = 10, queryObj: any = {}) {
    const { filter, sort, population } = aqp(queryObj);
    delete (filter as any).current;
    delete (filter as any).pageSize;

    // Mặc định chỉ lấy bản ghi CHƯA xóa
    if (filter.isDeleted === undefined) (filter as any).isDeleted = false;

    const page = Number(currentPage) > 0 ? Number(currentPage) : 1;
    const size = Math.min(Number(limit) > 0 ? Number(limit) : 10, 100);
    const offset = (page - 1) * size;

    const totalItems = await this.branchModel.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / size);

    const q = this.branchModel
      .find(filter)
      .sort(sort as any)
      .skip(offset)
      .limit(size);
    if (population) q.populate(population as any);
    const results = await q.exec();

    return {
      meta: {
        current: page,
        pageSize: size,
        pages: totalPages,
        total: totalItems,
      },
      results,
    };
  }

  async findOne(id: string) {
    const branch = await this.branchModel.findById(id);
    if (!branch || branch.isDeleted)
      throw new NotFoundException('Không tìm thấy chi nhánh');
    return branch;
  }

  async update(id: string, dto: any) {
    const branch = await this.branchModel.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      dto,
      { new: true, runValidators: true },
    );
    if (!branch) throw new NotFoundException('Không tìm thấy chi nhánh');
    return branch;
  }

  // XÓA MỀM — dùng plugin
  async remove(id: string, actor?: { _id: string; email: string }) {
    const res = await this.branchModel.updateOne(
      { _id: id, isDeleted: { $ne: true } },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: actor
            ? { _id: actor._id as any, email: actor.email }
            : undefined,
        },
      },
    );

    // res?.modifiedCount với plugin >=1 khi xoá thành công
    if (res.modifiedCount === 0) {
      throw new NotFoundException('Không tìm thấy chi nhánh');
    }
    return { message: 'Đã xóa (soft delete) chi nhánh' };
  }

  // PHỤC HỒI — dùng plugin
  async restore(id: string) {
    const res = await this.branchModel.updateOne(
      { _id: id, isDeleted: true },
      {
        $set: { isDeleted: false },
        $unset: { deletedAt: 1, deletedBy: 1 },
      },
    );
    if (res.modifiedCount === 0) {
      throw new NotFoundException('Không tìm thấy chi nhánh đã xoá');
    }
    return { message: 'Đã khôi phục chi nhánh' };
  }

  // XÓA HẲN (hard delete) — cẩn thận!
  async hardDelete(id: string) {
    const res = await this.branchModel.deleteOne({ _id: id });
    if (!res || (res as any).deletedCount === 0) {
      throw new NotFoundException('Không tìm thấy chi nhánh');
    }
    return { message: 'Đã xóa vĩnh viễn chi nhánh' };
  }

  async findTrash() {
    // Lấy toàn bộ chi nhánh đã xóa mềm
    return this.branchModel.find({ isDeleted: true });
  }
}
