import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import { MailService } from '../mail/mail.service';
import aqp from 'api-query-params';
import mongoose, { Model } from 'mongoose';
import { IUser } from 'src/types/user.interface';
import {
  Notification,
  NotificationDocument,
  NotificationStatus,
  NotificationType,
} from './schemas/notification.schemas';
import { NotificationsGateway } from './notifications.gateway';
import { Order, OrderDocument } from '../orders/schemas/order.schemas';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
    @InjectModel(Order.name)
    private orderModel: Model<OrderDocument>,
    private readonly mailService: MailService,
    private readonly gateway: NotificationsGateway,
  ) {}

  private normalizeRecipient(recipient?: string) {
    const value = String(recipient || '').trim();
    if (value.toLowerCase().startsWith('role:')) {
      return `role:${value.slice(5).toUpperCase()}`;
    }
    return value.includes('@') ? value.toLowerCase() : value;
  }

  private getUserRecipients(user?: IUser) {
    const recipients = [
      user?._id ? String(user._id) : '',
      user?.email ? this.normalizeRecipient(user.email) : '',
    ].filter(Boolean);

    // Shippers only receive messages addressed to their own id/email. They must
    // never inherit a role-wide order feed from other delivery personnel.
    if (user?.role && String(user.role).toUpperCase() !== 'SHIPPER') {
      recipients.push(`role:${String(user.role).toUpperCase()}`);
    }

    return [...new Set(recipients)];
  }

  async create(dto: CreateNotificationDto) {
    const recipient = this.normalizeRecipient(dto.recipient);
    const notification = await this.notificationModel.create({
      ...dto,
      recipient,
      status: NotificationStatus.PENDING,
      isDeleted: false,
    });

    // Gửi thực tế theo type
    if (dto.type === NotificationType.EMAIL) {
      await this.sendEmail(notification);
    }

    // Emit real-time notification. If recipient looks like an ObjectId send to room, otherwise broadcast.
    try {
      // support role-based recipients (e.g., 'role:ADMIN')
      if (
        recipient &&
        typeof recipient === 'string' &&
        recipient.startsWith('role:')
      ) {
        const roleRoom = recipient;
        this.gateway.server.to(roleRoom).emit('notification', notification);
        this.logger.log(
          `Emitted notification ${notification._id} to role room ${roleRoom}`,
        );
        return notification;
      }
      const isObjectId = mongoose.Types.ObjectId.isValid(recipient);
      if (isObjectId) {
        this.gateway.sendToUser(recipient, 'notification', notification);
        this.logger.log(
          `Emitted notification ${notification._id} to user room ${recipient}`,
        );
      } else if (recipient && recipient.includes('@')) {
        // recipient looks like an email — emit to the email room only (avoid double-delivery)
        const em = String(recipient).trim().toLowerCase();
        this.gateway.server
          .to(`email:${em}`)
          .emit('notification', notification);
        this.logger.log(
          `Emitted notification ${notification._id} to email room email:${em}`,
        );
      } else {
        this.logger.warn(
          `Notification ${notification._id} has no routable recipient; realtime emit skipped`,
        );
      }
    } catch (err) {
      this.logger.warn('Failed to emit notification via gateway', err as any);
    }

    return notification;
  }

  async findAll(currentPage = 1, limit = 10, qs: any = {}, user?: IUser) {
    const { filter, sort } = aqp(qs);
    delete filter.current;
    delete filter.pageSize;

    if (filter.isDeleted === undefined) filter.isDeleted = false;

    if (user?.role !== 'ADMIN') {
      filter.recipient = { $in: this.getUserRecipients(user) };
    }

    if (String(user?.role).toUpperCase() === 'SHIPPER' && user?._id) {
      const assignedOrderIds = await this.orderModel.distinct('_id', {
        assignedShipperId: new mongoose.Types.ObjectId(user._id),
        isDeleted: false,
      });
      filter.relatedOrderId = { $in: assignedOrderIds.map(String) };
    }

    // Normalize recipient filter: support comma-separated values or arrays -> $in
    if (filter.recipient && user?.role === 'ADMIN') {
      if (Array.isArray(filter.recipient)) {
        const arr = filter.recipient.map((r: any) =>
          this.normalizeRecipient(r),
        );
        filter.recipient = { $in: arr };
      } else if (
        typeof filter.recipient === 'string' &&
        filter.recipient.includes(',')
      ) {
        const arr = filter.recipient
          .split(',')
          .map((s) => this.normalizeRecipient(s))
          .filter(Boolean);
        if (arr.length) filter.recipient = { $in: arr };
      } else if (typeof filter.recipient === 'string') {
        filter.recipient = this.normalizeRecipient(filter.recipient);
      } else if (filter.recipient.$in) {
        filter.recipient.$in = filter.recipient.$in
          .map((r: any) => this.normalizeRecipient(r))
          .filter(Boolean);
      }
    }

    const page = Number(currentPage) > 0 ? Number(currentPage) : 1;
    const size = Math.min(Number(limit) > 0 ? Number(limit) : 10, 100);
    const offset = (page - 1) * size;
    const sortOption =
      sort && Object.keys(sort as any).length ? sort : { createdAt: -1 };
    const totalItems = await this.notificationModel.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / size);

    const results = await this.notificationModel
      .find(filter)
      .skip(offset)
      .limit(size)
      .sort(sortOption as any)
      .exec();

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

  async findOne(id: string, user: IUser) {
    const notification = await this.notificationModel.findById(id);
    if (!notification || notification.isDeleted)
      throw new NotFoundException('Notification not found');
    this.assertCanAccess(notification, user);
    return notification;
  }

  async update(id: string, dto: UpdateNotificationDto, user: IUser) {
    const notification = await this.findOne(id, user);
    const update =
      user.role === 'ADMIN'
        ? dto
        : { status: NotificationStatus.SENT, readAt: new Date() };
    Object.assign(notification, update);
    return notification.save();
  }

  async markAllRead(user: IUser) {
    const now = new Date();
    const recipients = this.getUserRecipients(user);
    if (!recipients.length) return { modified: 0 };

    const res = await this.notificationModel.updateMany(
      {
        recipient: { $in: recipients },
        status: { $ne: NotificationStatus.SENT },
        isDeleted: false,
      },
      { $set: { status: NotificationStatus.SENT, readAt: now } },
    );
    return { modified: res.modifiedCount || 0 };
  }

  async remove(id: string, user: IUser) {
    const notification = await this.notificationModel.findById(id);
    if (!notification || notification.isDeleted)
      throw new NotFoundException('Notification not found');
    this.assertCanAccess(notification, user);

    notification.isDeleted = true;
    notification.deletedAt = new Date();
    notification.deletedBy = {
      _id: new mongoose.Types.ObjectId(user._id),
      email: user.email,
    };

    await notification.save();
    return { message: 'Notification deleted' };
  }

  async dismissOrderNotifications(
    orderId: string,
    recipient: string,
  ): Promise<void> {
    await this.notificationModel.updateMany(
      {
        relatedOrderId: String(orderId),
        recipient: this.normalizeRecipient(recipient),
        isDeleted: false,
      },
      { $set: { isDeleted: true, deletedAt: new Date() } },
    );
  }

  emitUserEvent(userId: string, event: string, payload: unknown): void {
    this.gateway.sendToUser(userId, event, payload);
  }

  private assertCanAccess(
    notification: NotificationDocument,
    user: IUser,
  ): void {
    if (user.role === 'ADMIN') return;
    if (!this.getUserRecipients(user).includes(notification.recipient)) {
      throw new NotFoundException('Notification not found');
    }
  }

  private async sendEmail(notification: NotificationDocument) {
    await this.mailService.sendMail({
      to: notification.recipient,
      subject: notification.title,
      template: 'notification.hbs',
      context: {
        message: notification.message,
      },
    });

    await this.notificationModel.updateOne(
      { _id: notification._id },
      { status: 'SENT' },
    );
  }
}
