import { Routes } from '@angular/router';

// USER features
import { Home } from './home/home';
import { Login } from './account/login/login';
import { Register } from './account/register/register';
import { ForgetPassword } from './account/forgetpassword/forgetpassword';
import { Verify } from './account/verify/verify';
import { VerifyReset } from './account/verify-reset/verify-reset';
import { ResetPassword } from './account/reset-password/reset-password';
import { Transaction } from './transaction/transaction';
import { DashboardLayout } from './dashboard-layout/dashboard-layout';
import { DashboardHome } from './dashboard-layout/dashboard-home/dashboard-home';
import { Profile } from './dashboard-layout/dashboard-profile/dashboard-profile';

// Guards
import { AuthGuard } from './guard/auth.guard';
// (tùy chọn) AdminGuard nếu có
import { AdminGuard } from './guard/admin.guard';
// Layouts mới
import { UserLayout } from './layouts/user/user-layout';
import { AdminLayout } from './layouts/admin/admin-layout.component';
import { DashboardAdmin } from './dashboard-layout/dashboard-admin/dashboard-admin.component';
import { BranchListComponent } from './branches/branch-list/branch-list.component';
import { BranchCreateComponent } from './branches/branch-create/branch-create.component';

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

      { path: 'transaction', canActivate: [AuthGuard], component: Transaction },

      // dashboard của user (giữ nguyên thư mục/dashboard-layout)
      {
        path: 'dashboard',
        canActivate: [AuthGuard],
        component: DashboardLayout,
        children: [
          { path: '', component: DashboardHome },
          { path: 'home', component: DashboardHome },
          { path: 'profile', component: Profile },
        ],
      },
    ],
  },

  {
    path: 'admin',
    component: AdminLayout,
    canActivate: [AuthGuard, AdminGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: DashboardAdmin },
      {
        path: 'branch',
        children: [
          { path: '', component: BranchListComponent }, // /admin/branch
          { path: 'create', component: BranchCreateComponent }, // /admin/branch/create
        ],
      },
    ],
  },

  // 404
  { path: '**', redirectTo: '' },
];
