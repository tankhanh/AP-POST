import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-home',
  standalone: true,
  templateUrl: './home.html',
  imports: [CommonModule, FormsModule, RouterLink],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Home {
  constructor(public auth: AuthService) {}

  get orderLink(): any[] {
    if (this.auth.isLoggedIn()) {
      const user = this.auth.getUser();
      if (this.auth.isAdmin(user)) return ['/admin/dashboard'];
      if (this.auth.isEmployee(user)) return ['/employee/dashboard'];
      if (this.auth.isCustomer(user)) return ['/customer/order/create'];
      // fallback to dashboard
      return ['/employee/dashboard'];
    }
    return ['/register'];
  }
}
