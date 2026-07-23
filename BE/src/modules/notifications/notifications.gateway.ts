import { Logger, OnModuleDestroy } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import { UserRole } from '../users/user-role.enum';

const socketCors = {
  origin: (
    origin: string | undefined,
    callback: (error: Error | null, allow?: boolean) => void,
  ) => {
    const allowedOrigins = (
      process.env.CORS_ORIGINS ||
      'http://localhost:4200,https://ap-post.vercel.app'
    )
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin is not allowed'));
  },
  credentials: true,
};

@WebSocketGateway({ cors: socketCors, namespace: '/notifications' })
export class NotificationsGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);
  private readonly shipperConnections = new Map<string, Set<string>>();
  private presenceHeartbeat?: NodeJS.Timeout;

  constructor(
    private readonly jwtService: JwtService,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  afterInit(_server: Server) {
    this.logger.log('NotificationsGateway initialized');
    this.presenceHeartbeat = setInterval(() => {
      void this.touchOnlineShippers([...this.shipperConnections.keys()]).catch(
        (error) =>
          this.logger.warn(
            `Could not refresh shipper presence: ${error.message}`,
          ),
      );
    }, 30_000);
    this.presenceHeartbeat.unref?.();
  }

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token as string | undefined;
      if (!token) {
        client.disconnect();
        return;
      }

      const payload: any = this.jwtService.verify(token, {
        issuer: 'ap-post-api',
      });
      if (payload?.tokenType !== 'access') {
        client.disconnect();
        return;
      }
      const userId = payload && (payload.sub || payload._id || payload.id);
      const email = payload && (payload.email || payload.user?.email);
      if (!userId && !email) {
        client.disconnect();
        return;
      }

      client.data.user = payload;
      if (userId) {
        client.join(String(userId));
        this.logger.log(`Client connected and joined room ${userId}`);
      }
      if (email) {
        const em = String(email).trim().toLowerCase();
        client.join(`email:${em}`);
        this.logger.log(`Client joined email room email:${em}`);
      }
      const roles = (payload && (payload.roles || payload.role)) || null;
      const normalizedRoles = (Array.isArray(roles) ? roles : [roles])
        .filter(Boolean)
        .map((role) => String(role).trim().toUpperCase());
      for (const role of normalizedRoles) {
        // Shipper notifications are intentionally private to the assigned user.
        if (role !== 'SHIPPER') {
          client.join(`role:${role}`);
          this.logger.log(`Client joined role room role:${role}`);
        }
      }

      if (userId && normalizedRoles.includes('SHIPPER')) {
        const shipperId = String(userId);
        const connections =
          this.shipperConnections.get(shipperId) ?? new Set<string>();
        connections.add(client.id);
        this.shipperConnections.set(shipperId, connections);
        client.data.presenceShipperId = shipperId;
        const presence = await this.updateShipperPresence(shipperId, true);
        if (presence)
          this.emitShipperPresence(shipperId, true, presence.lastSeenAt);
      }
    } catch (_error) {
      this.logger.warn('Socket auth failed, disconnecting client');
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const shipperId = client.data.presenceShipperId as string | undefined;
    if (shipperId) {
      const connections = this.shipperConnections.get(shipperId);
      connections?.delete(client.id);
      if (!connections?.size) {
        this.shipperConnections.delete(shipperId);
        try {
          const presence = await this.updateShipperPresence(shipperId, false);
          if (presence)
            this.emitShipperPresence(shipperId, false, presence.lastSeenAt);
        } catch (_error) {
          this.logger.warn(
            `Could not update offline presence for ${shipperId}`,
          );
        }
      }
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  onModuleDestroy(): void {
    if (this.presenceHeartbeat) clearInterval(this.presenceHeartbeat);
  }

  sendToUser(userId: string, event: string, payload: any) {
    try {
      this.server.to(String(userId)).emit(event, payload);
    } catch (err) {
      this.logger.error('Failed to send to user', err as any);
    }
  }

  broadcast(event: string, payload: any) {
    this.server.emit(event, payload);
  }

  private emitShipperPresence(
    shipperId: string,
    isOnline: boolean,
    lastSeenAt?: Date,
  ): void {
    this.server
      .to('role:ADMIN')
      .to('role:STAFF')
      .emit('shipper:presence', {
        shipperId,
        isOnline,
        lastSeenAt: lastSeenAt ?? new Date(),
      });
  }

  private updateShipperPresence(shipperId: string, isOnline: boolean) {
    if (!Types.ObjectId.isValid(shipperId)) return null;
    const lastSeenAt = new Date();
    return this.userModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(shipperId),
          role: UserRole.SHIPPER,
          isDeleted: false,
        },
        { $set: { isOnline, lastSeenAt } },
        { new: true },
      )
      .select('_id isOnline lastSeenAt')
      .lean();
  }

  private async touchOnlineShippers(shipperIds: string[]): Promise<void> {
    const ids = shipperIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    if (!ids.length) return;
    await this.userModel.updateMany(
      { _id: { $in: ids }, role: UserRole.SHIPPER, isDeleted: false },
      { $set: { isOnline: true, lastSeenAt: new Date() } },
    );
  }
}
