import { Component, OnInit, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationsService } from '../../services/notifications.service';
import { AuthService } from '../../services/auth.service';
import { HttpClientModule } from '@angular/common/http';
import { SocketService } from '../../services/socket.service';
import { SoundService } from '../../services/sound.service';
import { Subscription } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { Router } from '@angular/router';

@Component({
  selector: 'app-notification-center',
  standalone: true,
  imports: [CommonModule, HttpClientModule],
  templateUrl: './notification-center.html',
  styleUrls: ['./notification-center.css'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class NotificationCenter implements OnInit {
  notifications: any[] = [];
  unreadCount = 0;
  loading = false;
  open = false;
  private socketSub?: Subscription;
  muted = false;

  constructor(
    private svc: NotificationsService,
    private auth: AuthService,
    private socket: SocketService,
    private toastr: ToastrService,
    private router: Router,
    private sound: SoundService,
  ) {}

  ngOnInit(): void {
    if (this.auth.isLoggedIn()) {
      // read mute pref
      try { this.muted = this.sound.isMuted(); } catch (e) { this.muted = false; }
      // seed with existing notifications
      this.load();

      // connect socket and listen for real-time notifications
      this.socket.connect();
      this.socketSub = this.socket.on('notification').subscribe((n: any) => {
        // avoid duplicates (same _id) when server emits multiple events
        if (n && n._id && this.notifications.some((s) => s._id === n._id)) return;
        // prepend new notification
        this.notifications.unshift(n);
        this.refreshUnreadCount();
        // open the panel for visibility
        this.open = true;
        // play a short sound to draw attention (silently ignore failures)
        try {
          this.sound.play();
        } catch (err) {}
        // show a toast for immediate feedback
        try {
          this.toastr.info(n.message || n.title || 'Thông báo mới', n.title || undefined, {
            timeOut: 5000,
            closeButton: true,
          });
        } catch (err) {
          // ignore toastr errors
        }
      });
    }
  }

  ngOnDestroy(): void {
    this.socketSub?.unsubscribe();
    this.socket.disconnect();
  }

  toggle(event?: Event) {
    if (event) event.stopPropagation();
    this.open = !this.open;
  }

  toggleMute(event?: Event) {
    if (event) event.stopPropagation();
    this.muted = !this.muted;
    try { this.sound.setMuted(this.muted); } catch (e) {}
  }

  openNotification(n: any) {
    // mark read locally and navigate to a sensible place
    try {
      this.markRead(n);
    } catch (err) {}

    const target = n.relatedOrderId || n.relatedShipmentId || n.waybill || n.recipient;
    // navigate to tracking with query param for best compatibility
    this.router.navigate(['/tracking'], { queryParams: { q: target } }).catch(() => {});
    this.open = false;
  }

  load() {
    this.loading = true;
    const user = this.auth.getUser() || {};
    // Request notifications for both user id and email (some notifications store email as recipient)
    let recipientFilter = '';
    const parts: string[] = [];
    if (user._id) parts.push(String(user._id));
    if (user.email) parts.push(String(user.email).trim().toLowerCase());
    if (parts.length) recipientFilter = `recipient=${parts.map(encodeURIComponent).join(',')}`;
    this.svc.list(1, 20, recipientFilter).subscribe(
      (res: any) => {
        this.notifications = this.extractNotifications(res);
        this.refreshUnreadCount();
        this.loading = false;
      },
      () => (this.loading = false),
    );
  }

  markRead(n: any, event?: Event) {
    if (event) event.stopPropagation();
    const readAt = new Date();
    this.svc.update(n._id, { status: 'SENT', readAt }).subscribe((res: any) => {
      const updated = res?.data || res || {};
      this.notifications = this.notifications.map((item) =>
        item._id === n._id ? { ...item, ...updated, status: 'SENT', readAt: updated.readAt || readAt } : item,
      );
      this.refreshUnreadCount();
    });
  }

  markAllRead() {
    this.svc.markAllRead().subscribe(() => {
      // update client-side state quickly
      this.notifications = this.notifications.map((n) => ({ ...n, status: 'SENT', readAt: new Date() }));
      this.refreshUnreadCount();
    });
  }

  removeNotification(n: any, event?: Event) {
    if (event) event.stopPropagation();
    this.svc.remove(n._id).subscribe(() => {
      this.notifications = this.notifications.filter((item) => item._id !== n._id);
      this.refreshUnreadCount();
    });
  }

  private extractNotifications(res: any): any[] {
    const payload = res?.data || res;
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.results)) return payload.results;
    if (Array.isArray(payload?.result)) return payload.result;
    return [];
  }

  private refreshUnreadCount() {
    this.unreadCount = this.notifications.filter((n) => n.status === 'PENDING' && !n.readAt).length;
  }

  // Play a short notification sound. Prefer bundled audio file, fallback to WebAudio beep.
  // sound playing moved to SoundService
}
