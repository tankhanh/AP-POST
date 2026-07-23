import { Routes } from '@angular/router';
import { AdminGuard } from './guard/admin.guard';
import { AuthGuard } from './guard/auth.guard';
import { RoleGuard } from './guard/role.guard';

export const routes: Routes = [
  {
    path: 'tracking',
    loadComponent: () =>
      import('./dashboard-layout/dashboard-tracking/dashboard-tracking').then(
        (module) => module.TrackingComponent,
      ),
  },
  {
    path: 'calculator',
    loadComponent: () =>
      import('./dashboard-layout/user-calculator/user-calculator').then(
        (module) => module.CalculateShippingComponent,
      ),
  },
  {
    path: 'ship',
    data: { publicCreate: true },
    loadComponent: () =>
      import('./dashboard-layout/dashboard-emoloyee/dashboard-orders/createOrder').then(
        (module) => module.CreateOrder,
      ),
  },
  {
    path: 'payment/success',
    loadComponent: () =>
      import('./payment/success/payment-success.component').then(
        (module) => module.PaymentSuccessComponent,
      ),
  },
  {
    path: '',
    loadComponent: () =>
      import('./layouts/employee/employee-layout').then((module) => module.EmployeeLayout),
    children: [
      {
        path: '',
        loadComponent: () => import('./home/home').then((module) => module.Home),
      },
      { path: 'home', redirectTo: '', pathMatch: 'full' },
      {
        path: 'login',
        loadComponent: () => import('./account/login/login').then((module) => module.Login),
      },
      {
        path: 'register',
        loadComponent: () =>
          import('./account/register/register').then((module) => module.Register),
      },
      {
        path: 'forget-password',
        loadComponent: () =>
          import('./account/forgetpassword/forgetpassword').then((module) => module.ForgetPassword),
      },
      {
        path: 'verify',
        loadComponent: () => import('./account/verify/verify').then((module) => module.Verify),
      },
      {
        path: 'verify-reset',
        loadComponent: () =>
          import('./account/verify-reset/verify-reset').then((module) => module.VerifyReset),
      },
      {
        path: 'reset-password',
        loadComponent: () =>
          import('./account/reset-password/reset-password').then((module) => module.ResetPassword),
      },
      {
        path: 'employee',
        canActivate: [AuthGuard, RoleGuard],
        data: { roles: ['STAFF'] },
        loadComponent: () =>
          import('./dashboard-layout/dashboard-layout').then((module) => module.DashboardLayout),
        children: employeeRoutes(),
      },
      {
        path: 'customer',
        canActivate: [AuthGuard, RoleGuard],
        data: { roles: ['USER'] },
        loadComponent: () =>
          import('./dashboard-layout/dashboard-layout').then((module) => module.DashboardLayout),
        children: customerRoutes(),
      },
    ],
  },
  {
    path: 'admin',
    canActivate: [AuthGuard, AdminGuard],
    loadComponent: () =>
      import('./layouts/admin/admin-layout.component').then((module) => module.AdminLayout),
    children: adminRoutes(),
  },
  {
    path: 'shipper',
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['SHIPPER'] },
    loadComponent: () =>
      import('./layouts/shipper/shipper-layout').then((module) => module.ShipperLayout),
    children: [
      {
        path: '',
        pathMatch: 'full',
        data: { view: 'active' },
        loadComponent: () =>
          import('./shipper/shipper-jobs/shipper-jobs').then((module) => module.ShipperJobs),
      },
      {
        path: 'jobs',
        data: { view: 'active' },
        loadComponent: () =>
          import('./shipper/shipper-jobs/shipper-jobs').then((module) => module.ShipperJobs),
      },
      {
        path: 'jobs/:id',
        loadComponent: () =>
          import('./shipper/shipper-job-detail/shipper-job-detail').then(
            (module) => module.ShipperJobDetail,
          ),
      },
      {
        path: 'history',
        data: { view: 'history' },
        loadComponent: () =>
          import('./shipper/shipper-jobs/shipper-jobs').then((module) => module.ShipperJobs),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./shipper/shipper-profile/shipper-profile').then(
            (module) => module.ShipperProfile,
          ),
      },
    ],
  },
  {
    path: '**',
    loadComponent: () =>
      import('./shared/not-found/not-found').then((module) => module.NotFoundComponent),
  },
];

function employeeRoutes(): Routes {
  return [
    { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    dashboardHomeRoute('dashboard'),
    dashboardHomeRoute('home'),
    profileRoute(),
    createOrderRoute(),
    listOrdersRoute(),
    editOrderRoute(),
    {
      path: 'pricing',
      loadComponent: () =>
        import('./dashboard-layout/dashboard-emoloyee/dashboard-pricing/listPricing').then(
          (module) => module.ListPricing,
        ),
    },
    {
      path: 'branch',
      loadComponent: () =>
        import('./dashboard-layout/dashboard-emoloyee/dashboard-branches/dashboard-branch').then(
          (module) => module.ListBranch,
        ),
    },
  ];
}

function customerRoutes(): Routes {
  return [
    { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    dashboardHomeRoute('dashboard'),
    profileRoute(),
    createOrderRoute(),
    listOrdersRoute(),
    editOrderRoute(),
  ];
}

function adminRoutes(): Routes {
  return [
    { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    {
      path: 'dashboard',
      loadComponent: () =>
        import('./dashboard-layout/dashboard-admin/dashboard-admin.component').then(
          (module) => module.DashboardAdmin,
        ),
    },
    {
      path: 'order/create',
      loadComponent: () =>
        import('./dashboard-layout/dashboard-admin/dashboard-orders/adminCreateOrder').then(
          (module) => module.AdmninCreateOrder,
        ),
    },
    {
      path: 'orders/list',
      loadComponent: () =>
        import('./dashboard-layout/dashboard-admin/dashboard-orders/adminlistOrder').then(
          (module) => module.AdminListOrder,
        ),
    },
    {
      path: 'order/edit/:id',
      loadComponent: () =>
        import('./dashboard-layout/dashboard-admin/dashboard-orders/adminEditOrder').then(
          (module) => module.AdminEditOrder,
        ),
    },
    {
      path: 'pricing',
      loadComponent: () =>
        import('./dashboard-layout/dashboard-admin/dashboard-pricing/dashboard-pricing').then(
          (module) => module.DashboardPricingComponent,
        ),
    },
    {
      path: 'support',
      loadComponent: () =>
        import('./dashboard-layout/dashboard-admin/support/support.component').then(
          (module) => module.SupportComponent,
        ),
    },
    {
      path: 'branch',
      children: [
        {
          path: '',
          loadComponent: () =>
            import('./branches/branch-list/branch-list.component').then(
              (module) => module.BranchListComponent,
            ),
        },
        {
          path: 'create',
          loadComponent: () =>
            import('./branches/branch-create/branch-create.component').then(
              (module) => module.BranchCreateComponent,
            ),
        },
        {
          path: 'detail/:id',
          loadComponent: () =>
            import('./branches/branch-detail/branch-detail.component').then(
              (module) => module.BranchDetailComponent,
            ),
        },
        {
          path: 'update/:id',
          loadComponent: () =>
            import('./branches/branch-update/branch-update.component').then(
              (module) => module.BranchUpdateComponent,
            ),
        },
        {
          path: 'trash',
          loadComponent: () =>
            import('./branches/branch-trash/branch-trash.component').then(
              (module) => module.BranchTrashComponent,
            ),
        },
      ],
    },
    {
      path: 'staff',
      children: [
        {
          path: '',
          loadComponent: () =>
            import('./dashboard-layout/dashboard-admin/staffs/staff-list/staff-list.component').then(
              (module) => module.StaffListComponent,
            ),
        },
        {
          path: 'create',
          loadComponent: () =>
            import('./dashboard-layout/dashboard-admin/staffs/staff-create/staff-create.component').then(
              (module) => module.StaffCreateComponent,
            ),
        },
        {
          path: 'detail/:id',
          loadComponent: () =>
            import('./dashboard-layout/dashboard-admin/staffs/staff-detail/staff-detail.component').then(
              (module) => module.StaffDetailComponent,
            ),
        },
        {
          path: 'update/:id',
          loadComponent: () =>
            import('./dashboard-layout/dashboard-admin/staffs/staff-update/staff-update.component').then(
              (module) => module.StaffUpdateComponent,
            ),
        },
        {
          path: 'trash',
          loadComponent: () =>
            import('./dashboard-layout/dashboard-admin/staffs/staff-trash/staff-trash.component').then(
              (module) => module.StaffTrashComponent,
            ),
        },
      ],
    },
    {
      path: 'shippers',
      loadComponent: () =>
        import('./shipper/admin-shipper-management/admin-shipper-management').then(
          (module) => module.AdminShipperManagement,
        ),
    },
  ];
}

function dashboardHomeRoute(path: string): Routes[number] {
  return {
    path,
    loadComponent: () =>
      import('./dashboard-layout/dashboard-emoloyee/dashboard-home/dashboard-home').then(
        (module) => module.DashboardHome,
      ),
  };
}

function profileRoute(): Routes[number] {
  return {
    path: 'profile',
    loadComponent: () =>
      import('./dashboard-layout/dashboard-emoloyee/dashboard-profile/dashboard-profile').then(
        (module) => module.DashboardProfile,
      ),
  };
}

function createOrderRoute(): Routes[number] {
  return {
    path: 'order/create',
    loadComponent: () =>
      import('./dashboard-layout/dashboard-emoloyee/dashboard-orders/createOrder').then(
        (module) => module.CreateOrder,
      ),
  };
}

function listOrdersRoute(): Routes[number] {
  return {
    path: 'orders/list',
    loadComponent: () =>
      import('./dashboard-layout/dashboard-emoloyee/dashboard-orders/listOrder').then(
        (module) => module.ListOrder,
      ),
  };
}

function editOrderRoute(): Routes[number] {
  return {
    path: 'order/edit/:id',
    loadComponent: () =>
      import('./dashboard-layout/dashboard-emoloyee/dashboard-orders/editOrder').then(
        (module) => module.EditOrder,
      ),
  };
}
