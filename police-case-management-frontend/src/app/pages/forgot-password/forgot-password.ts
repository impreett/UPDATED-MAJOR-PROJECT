import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Footer } from '../../components/footer/footer';
import { AppFeedbackService } from '../../services/app-feedback.service';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-forgot-password',
  imports: [CommonModule, ReactiveFormsModule, RouterLink, Footer],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.css',
})
export class ForgotPassword implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);

  @Input() embedded = false;
  @Input() prefilledEmail = '';
  @Output() completed = new EventEmitter<void>();

  get isEmbedded(): boolean {
    return this.embedded || this.route.snapshot.data['embedded'] === true;
  }

  requestForm = this.fb.nonNullable.group({
    email: '',
  });

  verifyForm = this.fb.nonNullable.group({
    otp: '',
  });

  resetForm = this.fb.nonNullable.group({
    newPassword: '',
    confirmPassword: '',
  });

  embeddedForm = this.fb.nonNullable.group({
    otp: '',
    newPassword: '',
    confirmPassword: '',
  });

  step: 'request' | 'verify' | 'reset' = 'request';
  loading = false;
  email = '';
  resetToken = '';
  showNewPassword = false;
  showConfirmPassword = false;
  resendCooldown = 0;
  private resendTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private auth: AuthService,
    private feedback: AppFeedbackService,
    private router: Router
  ) {}

  ngOnInit(): void {
    if (this.isEmbedded) {
      const email = this.normalizeEmail(this.prefilledEmail);
      if (!this.isValidEmail(email)) {
        this.feedback.showError('Email not found. Please re-login.');
        return;
      }
      this.email = email;
      void this.requestOtp(email, false);
    }
  }

  ngOnDestroy(): void {
    if (this.resendTimer) {
      clearInterval(this.resendTimer);
      this.resendTimer = null;
    }
  }

  private normalizeEmail(value: string): string {
    return String(value || '').trim().toLowerCase();
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  async sendOtp() {
    const email = this.normalizeEmail(this.requestForm.controls.email.value || '');
    if (!this.isValidEmail(email)) {
      this.feedback.showError('Enter a valid email address.');
      return;
    }

    await this.requestOtp(email, true);
  }

  private async requestOtp(email: string, advanceStep: boolean): Promise<boolean> {
    this.loading = true;
    try {
      await firstValueFrom(this.auth.requestForgotPasswordOtp({ email }));
      this.email = email;
      if (advanceStep) {
        this.step = 'verify';
      }
      this.feedback.showMessage('OTP sent to your email.', 'success');
      return true;
    } catch (err: any) {
      this.feedback.showError(err?.error?.msg || 'Failed to send OTP.');
      return false;
    } finally {
      this.loading = false;
    }
  }

  async verifyOtp() {
    const otp = String(this.verifyForm.controls.otp.value || '').trim();
    if (!/^\d{6}$/.test(otp)) {
      this.feedback.showError('OTP must be exactly 6 digits.');
      return;
    }

    this.loading = true;
    try {
      const response = await firstValueFrom(this.auth.verifyForgotPasswordOtp({ email: this.email, otp }));
      this.resetToken = response.resetToken;
      this.step = 'reset';
      this.feedback.showMessage('OTP verified. Set your new password.', 'success');
    } catch (err: any) {
      this.feedback.showError(err?.error?.msg || 'OTP verification failed.');
    } finally {
      this.loading = false;
    }
  }

  async resetPassword() {
    const newPassword = String(this.resetForm.controls.newPassword.value || '');
    const confirmPassword = String(this.resetForm.controls.confirmPassword.value || '');
    if (newPassword.length < 8) {
      this.feedback.showError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      this.feedback.showError('Passwords do not match.');
      return;
    }

    this.loading = true;
    try {
      await firstValueFrom(
        this.auth.resetPassword({
          email: this.email,
          resetToken: this.resetToken,
          newPassword,
        })
      );
      this.feedback.showMessage('Password reset successful. Please login.', 'success');
      this.router.navigate(['/login']);
    } catch (err: any) {
      this.feedback.showError(err?.error?.msg || 'Password reset failed.');
    } finally {
      this.loading = false;
    }
  }

  async submitEmbeddedReset() {
    if (this.loading) return;
    const email = this.normalizeEmail(this.email || this.prefilledEmail);
    if (!this.isValidEmail(email)) {
      this.feedback.showError('Email not found. Please re-login.');
      return;
    }

    const otp = String(this.embeddedForm.controls.otp.value || '').trim();
    if (!/^\d{6}$/.test(otp)) {
      this.feedback.showError('OTP must be exactly 6 digits.');
      return;
    }

    const newPassword = String(this.embeddedForm.controls.newPassword.value || '');
    const confirmPassword = String(this.embeddedForm.controls.confirmPassword.value || '');
    if (newPassword.length < 8) {
      this.feedback.showError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      this.feedback.showError('Passwords do not match.');
      return;
    }

    this.loading = true;
    try {
      const response = await firstValueFrom(this.auth.verifyForgotPasswordOtp({ email, otp }));
      const resetToken = response.resetToken;
      await firstValueFrom(
        this.auth.resetPassword({
          email,
          resetToken,
          newPassword,
        })
      );
      this.feedback.showMessage('Password reset successful.', 'success');
      this.completed.emit();
    } catch (err: any) {
      this.feedback.showError(err?.error?.msg || 'Password reset failed.');
    } finally {
      this.loading = false;
    }
  }

  async resendOtp() {
    if (this.loading || this.resendCooldown > 0) return;
    const email = this.normalizeEmail(this.email || this.prefilledEmail);
    if (!this.isValidEmail(email)) {
      this.feedback.showError('Email not found. Please re-login.');
      return;
    }
    const sent = await this.requestOtp(email, false);
    if (sent) {
      this.startResendCooldown(60);
    }
  }

  private startResendCooldown(seconds: number) {
    this.resendCooldown = seconds;
    if (this.resendTimer) {
      clearInterval(this.resendTimer);
    }
    this.resendTimer = setInterval(() => {
      this.resendCooldown = Math.max(0, this.resendCooldown - 1);
      if (this.resendCooldown === 0 && this.resendTimer) {
        clearInterval(this.resendTimer);
        this.resendTimer = null;
      }
    }, 1000);
  }
}
