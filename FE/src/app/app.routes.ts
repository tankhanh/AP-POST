import { Routes } from '@angular/router';

// USER features
import { Home } from './home/home';
import { Login } from './account/login/login';
import { Register } from './account/register/register';
import { ForgetPassword } from './account/forgetpassword/forgetpassword';
import { Verify } from './account/verify/verify';
import { VerifyReset } from './account/verify-reset/verify-reset';
import { ResetPassword } from './account/reset-password/reset-password';
import { DashboardLayout } from './dashboard-layout/dashboard-layout';
import { DashboardHome } from './dashboard-layout/dashboard-home/dashboard-home';

// Guards
import { AuthGuard } from './guard/auth.guard';
// (tùy chọn) AdminGuard nếu có
import { AdminGuard } from './guard/admin.guard';
// Layouts mới
import { UserLayout } from './layouts/user/user-layout';
import { AdminLayout } from './layouts/admin/admin-layout';
import { DashboardProfile } from './dashboard-layout/dashboard-profile/dashboard-profile';
import { CreateOrder } from './dashboard-layout/dashboard-orders/createOrder';
import { ListOrder } from './dashboard-layout/dashboard-orders/listOrder';
import { EditOrder } from './dashboard-layout/dashboard-orders/editOrder';

export const routes: Routes = [
  // ----- USER LAYOUT -----
  {
    path: '',
    component: UserLayout,
    children: [
      { path: '', component: Home },
      { path: 'home', redirectTo: '', pathMatch: 'full' },

      { path: 'login', component: Login },
      { path: 'register', component: Register },
      { path: 'forget-password', component: ForgetPassword },
      { path: 'verify', component: Verify },
      { path: 'verify-reset', component: VerifyReset },
      { path: 'reset-password', component: ResetPassword },
      {
        path: 'dashboard',
        canActivate: [AuthGuard],
        component: DashboardLayout,
        children: [
          { path: '', component: DashboardHome },
          { path: 'home', component: DashboardHome },
          { path: 'profile', component: DashboardProfile },
          { path: 'order/create', component: CreateOrder },
          { path: 'order/list', component: ListOrder },
          { path: 'order/edit/:id', component: EditOrder },
        ],
      },
    ],
  },

  // ----- ADMIN LAYOUT (tạo dần sau) -----
  {
    path: 'admin',
    component: AdminLayout,
    canActivate: [AuthGuard, AdminGuard], // nếu chưa có AdminGuard, tạm bỏ đi
    children: [
      // ví dụ:
      // { path: '', loadComponent: () => import('./admin/dashboard-home/dashboard-home').then(m => m.AdminDashboardHome) },
      // { path: 'orders', loadComponent: () => import('./admin/orders/orders').then(m => m.Orders) },
      // { path: 'users', loadComponent: () => import('./admin/users/users').then(m => m.Users) },
    ],
  },

  // 404
  { path: '**', redirectTo: '' },
];
