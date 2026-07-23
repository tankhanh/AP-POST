import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { env } from '../environments/environment';
import { AuthService } from './auth.service';

// Note: requires `socket.io-client` to be installed in the frontend dependencies.
import { io, Socket } from 'socket.io-client';

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket: Socket | null = null;

  constructor(private auth: AuthService) {}

  private wsBase(): string {
    // derive websocket base from API baseUrl by stripping /api or /api/v1
    try {
      return env.baseUrl.replace(/\/api(\/v1)?$/i, '');
    } catch (err) {
      return env.baseUrl;
    }
  }

  connect(): void {
    if (this.socket || !this.auth.isLoggedIn()) return;
    const token = localStorage.getItem('access_token') || '';
    const url = this.wsBase();
    // connect to the notifications namespace so server gateway namespace matches
    this.socket = io(`${url}/notifications`, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: { token },
      autoConnect: true,
    });

    this.socket.on('connect_error', (err: any) => console.warn('Socket connect_error', err));
  }

  on(event: string): Observable<any> {
    return new Observable((observer) => {
      if (!this.socket) this.connect();
      const handler = (data: any) => observer.next(data);
      this.socket?.on(event, handler);
      return () => this.socket?.off(event, handler);
    });
  }

  disconnect(): void {
    try {
      this.socket?.disconnect();
    } finally {
      this.socket = null;
    }
  }
}
