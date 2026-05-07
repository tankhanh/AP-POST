import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import { MailerService } from '@nestjs-modules/mailer';
import aqp from 'api-query-params';
import mongoose from 'mongoose';
import { IUser } from 'src/types/user.interface';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import {
  Notification,
  NotificationDocument,
  NotificationStatus,
  NotificationType,
} from './schemas/notification.schemas';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private notificationModel: SoftDeleteModel<NotificationDocument>,
    private readonly mailerService: MailerService,
    private readonly gateway: NotificationsGateway,
  ) {}

  private normalizeRecipient(recipient?: string) {
    const value = String(recipient || '').trim();
    return value.includes('@') ? value.toLowerCase() : value;
  }

  private getUserRecipients(user?: IUser) {
    const recipients = [
      user?._id ? String(user._id) : '',
      user?.email ? this.normalizeRecipient(user.email) : '',
    ].filter(Boolean);

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
      if (recipient && typeof recipient === 'string' && recipient.startsWith('role:')) {
        const roleRoom = recipient;
        this.gateway.server.to(roleRoom).emit('notification', notification);
        this.logger.log(`Emitted notification ${notification._id} to role room ${roleRoom}`);
        return notification;
      }
      const isObjectId = mongoose.Types.ObjectId.isValid(recipient);
      if (isObjectId) {
        this.gateway.sendToUser(recipient, 'notification', notification);
        this.logger.log(`Emitted notification ${notification._id} to user room ${recipient}`);
      } else if (recipient && recipient.includes('@')) {
        // recipient looks like an email — emit to the email room only (avoid double-delivery)
        const em = String(recipient).trim().toLowerCase();
        this.gateway.server.to(`email:${em}`).emit('notification', notification);
        this.logger.log(`Emitted notification ${notification._id} to email room email:${em}`);
      } else {
        this.gateway.broadcast('notification', notification);
        this.logger.log(`Broadcasted notification ${notification._id}`);
      }
    } catch (err) {
      this.logger.warn('Failed to emit notification via gateway', err as any);
    }

    return notification;
  }

  async findAll(currentPage = 1, limit = 10, qs: any = {}) {
    const { filter, sort } = aqp(qs);
    delete filter.current;
    delete filter.pageSize;

    if (filter.isDeleted === undefined) filter.isDeleted = false;

    // Normalize recipient filter: support comma-separated values or arrays -> $in
    if (filter.recipient) {
      if (Array.isArray(filter.recipient)) {
        const arr = filter.recipient.map((r: any) => this.normalizeRecipient(r));
        filter.recipient = { $in: arr };
      } else if (typeof filter.recipient === 'string' && filter.recipient.includes(',')) {
        const arr = filter.recipient.split(',').map((s) => this.normalizeRecipient(s)).filter(Boolean);
        if (arr.length) filter.recipient = { $in: arr };
      } else if (typeof filter.recipient === 'string') {
        filter.recipient = this.normalizeRecipient(filter.recipient);
      } else if (filter.recipient.$in) {
        filter.recipient.$in = filter.recipient.$in.map((r: any) => this.normalizeRecipient(r)).filter(Boolean);
      }
    }

    const page = Number(currentPage) > 0 ? Number(currentPage) : 1;
    const size = Number(limit) > 0 ? Number(limit) : 10;
    const offset = (page - 1) * size;
    const sortOption = sort && Object.keys(sort as any).length ? sort : { createdAt: -1 };
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

  async findOne(id: string) {
    const notification = await this.notificationModel.findById(id);
    if (!notification || notification.isDeleted) throw new NotFoundException('Notification not found');
    return notification;
  }

  async update(id: string, dto: UpdateNotificationDto) {
    const notification = await this.notificationModel.findOneAndUpdate(
      { _id: id, isDeleted: false },
      dto,
      {
        new: true,
      },
    );
    if (!notification) throw new NotFoundException('Notification not found');
    return notification;
  }

  async markAllRead(user: IUser) {
    const now = new Date();
    const recipients = this.getUserRecipients(user);
    if (!recipients.length) return { modified: 0 };

    const res = await this.notificationModel.updateMany(
      { recipient: { $in: recipients }, status: { $ne: NotificationStatus.SENT }, isDeleted: false },
      { $set: { status: NotificationStatus.SENT, readAt: now } },
    );
    return { modified: res.modifiedCount || 0 };
  }

  async remove(id: string, user: IUser) {
    const notification = await this.notificationModel.findById(id);
    if (!notification || notification.isDeleted) throw new NotFoundException('Notification not found');

    notification.isDeleted = true;
    notification.deletedAt = new Date();
    notification.deletedBy = {
      _id: new mongoose.Types.ObjectId(user._id),
      email: user.email,
    };

    await notification.save();
    return { message: 'Notification deleted' };
  }

  private async sendEmail(notification: NotificationDocument) {
    await this.mailerService.sendMail({
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
