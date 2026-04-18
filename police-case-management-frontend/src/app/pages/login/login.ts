import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Footer } from '../../components/footer/footer';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-login',
  imports: [CommonModule, ReactiveFormsModule, RouterLink, Footer],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private readonly fb = inject(FormBuilder);

  loginForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
    rememberMe: [false],
  });
  loading = false;
  submitted = false;
  errorTitle = '';
  errorMessage = '';
  showPassword = false;

  constructor(private auth: AuthService, private router: Router) {}

  get emailControl() {
    return this.loginForm.controls.email;
  }

  get passwordControl() {
    return this.loginForm.controls.password;
  }

  get emailError() {
    if (!this.shouldShowFieldError(this.emailControl)) return '';
    if (this.emailControl.hasError('required')) return 'Please enter your email.';
    if (this.emailControl.hasError('email')) return 'Enter a valid email address.';
    return '';
  }

  get passwordError() {
    if (!this.shouldShowFieldError(this.passwordControl)) return '';
    if (this.passwordControl.hasError('required')) return 'Please enter your password.';
    return '';
  }

  private shouldShowFieldError(control: { invalid: boolean; touched: boolean }) {
    return control.invalid && (control.touched || this.submitted);
  }

  private isAccessRestrictionError(err: any) {
    if (err?.status === 403) return true;
    const msg = (err?.error?.msg || err?.error?.message || '').toString().toLowerCase();
    return (
      msg.includes('verify otp') ||
      msg.includes('verify your account') ||
      msg.includes('suspend') ||
      msg.includes('restricted')
    );
  }

  private showErrorMessage(title: string, message: string) {
    this.errorTitle = title;
    this.errorMessage = message;
  }

  closeErrorMessage() {
    this.errorTitle = '';
    this.errorMessage = '';
  }

  goToForgotPassword(event: Event) {
    event.preventDefault();
    this.router.navigate(['/forgot-password']);
  }

  async onSubmit() {
    this.submitted = true;
    this.loginForm.markAllAsTouched();
    this.closeErrorMessage();
    if (this.loginForm.invalid || this.loading) return;

    this.loading = true;
    try {
      const { email, password, rememberMe } = this.loginForm.getRawValue();
      const res = await firstValueFrom(this.auth.login({ email, password }));
      const token = res?.token;
      if (!token) {
        this.showErrorMessage('Login failed', 'Invalid email or password.');
        return;
      }
      this.auth.setToken(token, rememberMe);
      this.router.navigate([res?.redirectTo || this.auth.getHomeRoute()]);
    } catch (err: any) {
      if (this.isAccessRestrictionError(err)) {
        const serverMessage = String(err?.error?.msg || 'Access restricted.');
        this.showErrorMessage(
          'Access restricted',
          serverMessage
        );
      } else {
        this.showErrorMessage('Login failed', 'Invalid email or password.');
      }
    } finally {
      this.loading = false;
    }
  }
}
