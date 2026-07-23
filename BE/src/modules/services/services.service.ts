import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import aqp from 'api-query-params';
import { Model, Types } from 'mongoose';
import { Service, ServiceDocument } from './schemas/service.schemas';
import { IUser } from 'src/types/user.interface';

@Injectable()
export class ServicesService {
  constructor(
    @InjectModel(Service.name)
    private serviceModel: Model<ServiceDocument>,
  ) {}

  async create(createServiceDto: CreateServiceDto) {
    return this.serviceModel.create(createServiceDto);
  }

  async findAll(currentPage = 1, limit = 10, qs?: string) {
    const { filter, sort, population } = aqp(qs);
    delete filter.current;
    delete filter.pageSize;
    if (filter.isDeleted === undefined) filter.isDeleted = false;

    currentPage = Math.max(Number(currentPage) || 1, 1);
    limit = Math.min(Math.max(Number(limit) || 10, 1), 100);
    const offset = (currentPage - 1) * limit;
    const totalItems = await this.serviceModel.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / limit);

    const results = await this.serviceModel
      .find(filter)
      .skip(offset)
      .limit(limit)
      .sort(sort as any)
      .populate(population)
      .exec();

    return {
      meta: {
        current: currentPage,
        pageSize: limit,
        pages: totalPages,
        total: totalItems,
      },
      results,
    };
  }

  async findOne(id: string) {
    const service = await this.serviceModel.findOne({
      _id: id,
      isDeleted: { $ne: true },
    });
    if (!service) throw new NotFoundException('Không tìm thấy dịch vụ');
    return service;
  }

  async update(id: string, updateServiceDto: UpdateServiceDto) {
    const service = await this.serviceModel.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      updateServiceDto,
      { new: true, runValidators: true },
    );
    if (!service) throw new NotFoundException('Không tìm thấy dịch vụ');
    return service;
  }

  async remove(id: string, user: IUser) {
    const service = await this.serviceModel.findOneAndUpdate(
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
      { new: true },
    );
    if (!service) throw new NotFoundException('Không tìm thấy dịch vụ');

    return { message: 'Đã xóa dịch vụ' };
  }
}
