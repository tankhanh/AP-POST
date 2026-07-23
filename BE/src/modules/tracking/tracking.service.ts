import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import aqp from 'api-query-params';
import { Connection, Model, Types } from 'mongoose';
import { CreateTrackingDto } from './dto/create-tracking.dto';
import { Tracking, TrackingDocument } from './schemas/tracking.schemas';
import { Order, OrderDocument } from '../orders/schemas/order.schemas';
import { IUser } from 'src/types/user.interface';
import { OrdersService } from '../orders/orders.service';

@Injectable()
export class TrackingService {
  constructor(
    @InjectModel(Tracking.name)
    private readonly trackingModel: Model<TrackingDocument>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly ordersService: OrdersService,
  ) {}

  async create(dto: CreateTrackingDto, user: IUser) {
    // Kiểm tra order có tồn tại không
    const order = await this.orderModel.findById(dto.orderId);
    if (!order || order.isDeleted) {
      throw new BadRequestException('Đơn hàng không tồn tại hoặc đã bị xóa');
    }

    if (order.status !== dto.status) {
      await this.ordersService.updateStatus(dto.orderId, dto.status, user);
      const tracking = await this.trackingModel
        .findOne({ orderId: dto.orderId, status: dto.status, isDeleted: false })
        .sort({ timestamp: -1 });
      if (!tracking) throw new NotFoundException('Tracking not found');
      tracking.location = dto.location;
      tracking.note = dto.note;
      tracking.branchId = dto.branchId
        ? new Types.ObjectId(dto.branchId)
        : tracking.branchId;
      await tracking.save();
      return tracking;
    }

    return this.trackingModel.create({
      orderId: new Types.ObjectId(dto.orderId),
      status: dto.status,
      location: dto.location,
      branchId: dto.branchId ? new Types.ObjectId(dto.branchId) : undefined,
      note: dto.note,
      timestamp: new Date(),
      createdBy: { _id: new Types.ObjectId(user._id), email: user.email },
    });
  }

  async findAll(currentPage = 1, limit = 10, queryObj: any = {}) {
    const { filter, sort, population } = aqp(queryObj);
    delete (filter as any).current;
    delete (filter as any).pageSize;
    if (filter.isDeleted === undefined) (filter as any).isDeleted = false;

    const page = Number(currentPage) > 0 ? Number(currentPage) : 1;
    const size = Math.min(Number(limit) > 0 ? Number(limit) : 10, 100);
    const skip = (page - 1) * size;

    const total = await this.trackingModel.countDocuments(filter);
    const pages = Math.ceil(total / size);

    const q = this.trackingModel
      .find(filter)
      .sort(sort as any)
      .skip(skip)
      .limit(size)
      .populate('shipmentId')
      .populate('branchId');

    if (population) q.populate(population as any);

    const results = await q.exec();
    return { meta: { current: page, pageSize: size, pages, total }, results };
  }

  async findByShipment(shipmentId: string) {
    return this.trackingModel
      .find({ shipmentId, isDeleted: false })
      .sort({ timestamp: 1 })
      .populate('branchId')
      .exec();
  }

  async findOne(id: string) {
    const input = id.trim().toUpperCase();

    let order;

    // Ưu tiên tìm bằng waybill (khách hàng nhập)
    if (/^[A-Z]{2}[0-9]{9}[A-Z]{2}$/.test(input)) {
      order = await this.orderModel.findOne({
        waybill: input,
        isDeleted: false,
      });
    } else {
      // Nếu không phải định dạng waybill → thử tìm bằng ObjectId (admin dùng)
      order = await this.orderModel.findById(input);
    }

    if (!order || order.isDeleted) {
      throw new NotFoundException('Không tìm thấy vận đơn');
    }

    const timeline = await this.trackingModel
      .find({ orderId: order._id, isDeleted: false })
      .sort({ timestamp: 1 })
      .populate('branchId', 'name')
      .lean()
      .exec();

    if (timeline.length === 0) {
      throw new NotFoundException('Vận đơn chưa có hành trình');
    }

    return {
      waybill: order.waybill,
      currentStatus: timeline[timeline.length - 1].status,
      updatedAt: timeline[timeline.length - 1].timestamp,
      senderName: order.senderName,
      receiverName: order.receiverName,
      receiverPhone: order.receiverPhone,
      timeline,
    };
  }

  // async update(id: string, dto: UpdateTrackingDto) {
  //   const tracking = await this.trackingModel.findByIdAndUpdate(id, dto, {
  //     new: true,
  //   });
  //   if (!tracking || tracking.isDeleted)
  //     throw new NotFoundException('Tracking not found');

  //   // nếu đổi status → cập nhật Shipment
  //   if (dto.status) {
  //     await this.touchShipmentTimeline(
  //       String(tracking.shipmentId),
  //       dto.status,
  //       dto.note,
  //     );
  //   }
  //   return tracking;
  // }

  // SOFT DELETE
  async remove(id: string, user: { _id: string; email: string }) {
    const res = await this.trackingModel.updateOne(
      { _id: id, isDeleted: { $ne: true } },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: { _id: new Types.ObjectId(user._id), email: user.email },
        },
      },
    );
    if (res.modifiedCount === 0) {
      throw new NotFoundException('Tracking not found');
    }
    return { message: 'Tracking soft-deleted' };
  }

  async restore(id: string) {
    const res = await this.trackingModel.updateOne(
      { _id: id, isDeleted: true },
      {
        $set: { isDeleted: false },
        $unset: { deletedAt: 1, deletedBy: 1 },
      },
    );
    if (res.modifiedCount === 0) {
      throw new NotFoundException('Tracking not found or not deleted');
    }
    return { message: 'Tracking restored' };
  }

  async findByWaybill(waybill: string): Promise<any> {
    const input = waybill.trim().toUpperCase();

    if (!/^[A-Z]{2}[0-9]{9}[A-Z]{2}$/.test(input)) {
      throw new BadRequestException(
        'Mã vận đơn không đúng định dạng (VD: VN123456789VN)',
      );
    }

    // Tìm Order theo waybill, dùng .lean() để tối ưu tốc độ
    const order = await this.orderModel
      .findOne({ waybill: input, isDeleted: false })
      .lean(); // <-- vẫn dùng .lean() cho nhanh

    if (!order) {
      throw new NotFoundException(`Không tìm thấy vận đơn ${input}`);
    }

    // Lấy timeline tracking
    const timeline = await this.trackingModel
      .find({ orderId: order._id, isDeleted: false })
      .sort({ timestamp: 1 })
      .populate('branchId', 'name address')
      .lean();

    // Xác định trạng thái mới nhất (nếu chưa có tracking → dùng CREATED)
    const latestTracking =
      timeline.length > 0 ? timeline[timeline.length - 1] : null;

    const currentStatus = latestTracking?.status || 'CREATED';
    const updatedAt =
      latestTracking?.timestamp || order.createdAt || new Date();

    const publicTimeline = timeline.map((event: any) => ({
      status: event.status,
      timestamp: event.timestamp,
      location: event.location,
      branchId:
        event.branchId && typeof event.branchId === 'object'
          ? { name: event.branchId.name }
          : undefined,
    }));

    return {
      waybill: order.waybill,
      currentStatus,
      updatedAt,
      timeline:
        publicTimeline.length > 0
          ? publicTimeline
          : [
              {
                status: 'CREATED',
                timestamp: order.createdAt || new Date(),
                location: 'Khách hàng đặt hàng online',
              },
            ],
    };
  }
}
