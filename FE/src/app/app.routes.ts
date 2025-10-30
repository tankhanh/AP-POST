import { Routes } from '@angular/router';
import { Home } from './home/home';
import { Login } from './account/login/login';
import { Register } from './account/register/register';
import { ForgetPassword } from './account/forgetpassword/forgetpassword';
import { Verify } from './account/verify/verify';
import { Profile } from './account/profile/profile';
import { Transaction } from './transaction/transaction';
import { VerifyReset } from './account/verify-reset/verify-reset';
import { ResetPassword } from './account/reset-password/reset-password';
import { AuthGuard } from './guard/auth.guard';

export const routes: Routes = [
    {
        path:'',
        component: Home,
    },
    {
        path:'home',
        component: Home
    },
    {
       path: 'login',
        component: Login
    },
    {
       path: 'register',
        component: Register
    },
    {
        path:'forget-password',
        component: ForgetPassword
    },
    {
        path:'verify',
        component: Verify
    },
    {
        path: 'profile',
        canActivate: [AuthGuard],
        component: Profile
    },
    {
        path:'transaction',
        canActivate: [AuthGuard],
        component: Transaction
    },
    {
        path: 'verify-reset',
        component: VerifyReset
    },
    {
        path:'reset-password',
        component: ResetPassword
    }
];
