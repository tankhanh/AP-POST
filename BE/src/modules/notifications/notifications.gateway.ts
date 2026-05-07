import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({ cors: true, namespace: '/notifications' })
export class NotificationsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(private jwtService: JwtService) {}

  afterInit(server: Server) {
    this.logger.log('NotificationsGateway initialized');
  }

  handleConnection(client: Socket) {
    try {
      const token = ((client.handshake.query && client.handshake.query.token) || (client.handshake.auth && (client.handshake.auth as any).token)) as string;
      if (!token) {
        client.disconnect();
        return;
      }

      const payload: any = this.jwtService.verify(token);
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
      // join role-based rooms if present in JWT payload (e.g., roles or role)
      try {
        const roles = (payload && (payload.roles || payload.role)) || null;
        if (roles) {
          const arr = Array.isArray(roles) ? roles : [roles];
          for (const r of arr) {
            if (r) {
              const rn = String(r).toUpperCase();
              client.join(`role:${rn}`);
              this.logger.log(`Client joined role room role:${rn}`);
            }
          }
        }
      } catch (e) {
        // ignore role join errors
      }
    } catch (err) {
      this.logger.warn('Socket auth failed, disconnecting client');
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
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
}
