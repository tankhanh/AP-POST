import { CommonModule } from "@angular/common";
import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterLink, RouterOutlet } from "@angular/router";
import { AuthService } from "../../services/auth.service";

@Component({
    selector: 'forgetpassword',
    imports: [
        CommonModule, FormsModule, RouterLink
    ],
    templateUrl: './forgetpassword.html',
    schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class ForgetPassword implements OnInit {
email: string = '';
  successMessage: string = '';
  errorMessage: string = '';
  constructor(private authService: AuthService) {}
    ngOnInit() {
    }
sendResetLink() {
    this.successMessage = '';
    this.errorMessage = '';

    if (!this.email) {
      this.errorMessage = 'Please enter your email.';
      return;
    }

    this.authService.requestPasswordReset(this.email).subscribe({
      next: (res: any) => {
        this.successMessage = 'Reset link has been sent to your email.';
        console.log('Reset request success:', res);
      },
      error: (err) => {
        console.error('Reset request failed:', err);
        this.errorMessage = err.error?.message || 'Something went wrong.';
      },
    });
  }
}