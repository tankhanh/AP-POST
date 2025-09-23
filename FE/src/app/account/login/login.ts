import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Login implements OnInit {
  email: string;
  password: string;
  errorMessage: string;

  constructor(private authService: AuthService, private router: Router) {}

  ngOnInit(): void {
    this.email = '';
    this.password = '';
    this.errorMessage = '';
  }
  login() {
  this.authService.login(this.email, this.password).subscribe({
    next: (res) => {
      console.log('Login success:', res);

      localStorage.setItem('access_token', res.data.access_token);

      this.router.navigate(['/']);
    },
    error: (err) => {
      console.error('Login failed:', err);
      this.errorMessage = err.error?.message || 'Login failed!';
    },
  });
}

}
