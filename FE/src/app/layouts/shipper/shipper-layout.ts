import { CommonModule } from '@angular/common';
import { Component, CUSTOM_ELEMENTS_SCHEMA, HostListener } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { NotificationCenter } from '../../shared/notification-center/notification-center';
import { SocketService } from '../../services/socket.service';

@Component({
  selector: 'app-shipper-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, NotificationCenter],
  templateUrl: './shipper-layout.html',
  styleUrl: './shipper-layout.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ShipperLayout {
  online = typeof navigator === 'undefined' ? true : navigator.onLine;

  constructor(
    readonly authService: AuthService,
    private readonly router: Router,
    private readonly socketService: SocketService,
  ) {}

  @HostListener('window:online')
  onOnline() {
    this.online = true;
  }

  @HostListener('window:offline')
  onOffline() {
    this.online = false;
  }

  logout() {
    this.socketService.disconnect();
    this.authService.logout();
    void this.router.navigate(['/login']);
  }
}
