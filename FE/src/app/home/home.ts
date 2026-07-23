import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-home',
  standalone: true,
  templateUrl: './home.html',
  imports: [CommonModule, RouterLink],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Home {
  constructor(public auth: AuthService) {}

  get isLoggedIn(): boolean {
    return this.auth.isLoggedIn();
  }

  get orderLink(): any[] {
    if (this.auth.isLoggedIn()) {
      const user = this.auth.getUser();
      if (this.auth.isAdmin(user)) return ['/admin/order/create'];
      if (this.auth.isEmployee(user)) return ['/employee/order/create'];
      if (this.auth.isCustomer(user)) return ['/customer/order/create'];
      return ['/login'];
    }
    return ['/ship'];
  }

  get workspaceLink(): any[] {
    const user = this.auth.getUser();
    if (this.auth.isAdmin(user)) return ['/admin/dashboard'];
    if (this.auth.isEmployee(user)) return ['/employee/dashboard'];
    if (this.auth.isCustomer(user)) return ['/customer/dashboard'];
    return ['/login'];
  }
}
