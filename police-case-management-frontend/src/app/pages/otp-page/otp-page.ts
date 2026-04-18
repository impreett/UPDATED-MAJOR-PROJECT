import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Footer } from '../../components/footer/footer';
import { AppFeedbackService } from '../../services/app-feedback.service';
import { AuthService } from '../../services/auth';

type OtpErrors = {
  otp?: string;
};

const OTP_PENDING_EMAIL_KEY = 'pcm_pending_otp_email';
const REGISTER_DRAFT_KEY = 'pcm_register_draft';
const OTP_PENDING_ROLE_KEY = 'pcm_pending_otp_role';

@Component({
  selector: 'app-otp-page',
  imports: [CommonModule, ReactiveFormsModule, RouterLink, Footer],
  templateUrl: './otp-page.html',
  styleUrl: './otp-page.css',
})
export class OtpPage implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  otpForm = this.fb.nonNullable.group({
    otp: '',
  });
  email = '';
  pendingRole = '';
  errors: OtpErrors = {};
  loading = false;
  infoMessage = '';
  resendCooldown = 0;
  isResending = false;
  private resendTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private auth: AuthService,
    private route: ActivatedRoute,
    private router: Router,
    private feedback: AppFeedbackService
  ) {}

  ngOnInit() {
    const queryEmail = this.route.snapshot.queryParamMap.get('email')?.trim().toLowerCase() || '';
    const queryRole = this.route.snapshot.queryParamMap.get('role')?.trim().toLowerCase() || '';
    const storedEmail = sessionStorage.getItem(OTP_PENDING_EMAIL_KEY)?.trim().toLowerCase() || '';
    const storedRole = sessionStorage.getItem(OTP_PENDING_ROLE_KEY)?.trim().toLowerCase() || '';
    const resolvedEmail = queryEmail || storedEmail;
    this.pendingRole = queryRole || storedRole;

    if (resolvedEmail) {
      this.email = resolvedEmail;
      sessionStorage.setItem(OTP_PENDING_EMAIL_KEY, resolvedEmail);
      if (this.pendingRole) {
        sessionStorage.setItem(OTP_PENDING_ROLE_KEY, this.pendingRole);
      }
      this.infoMessage = `An OTP has been sent to ${resolvedEmail}. Please check your inbox.`;
    }
  }

  validate() {
    const { otp } = this.otpForm.getRawValue();
    const nextErrors: OtpErrors = {};
    nextErrors.otp = /^\d{6}$/.test(otp) ? '' : 'Passkey must be exactly 6 digits.';
    this.errors = nextErrors;
    return Object.values(nextErrors).every((value) => value === '');
  }

  async onVerify() {
    if (!this.email) {
      this.feedback.showError('Email not found. Please register again.');
      this.router.navigate(['/register']);
      return;
    }

    if (!this.validate()) return;

    this.loading = true;
    try {
      const otp = this.otpForm.controls.otp.value.trim();
      const response = await firstValueFrom(this.auth.verifyRegistrationOtp({ email: this.email, otp }));
      if (response?.token) {
        this.auth.setToken(response.token, true);
      }
      sessionStorage.removeItem(OTP_PENDING_EMAIL_KEY);
      sessionStorage.removeItem(OTP_PENDING_ROLE_KEY);
      sessionStorage.removeItem(REGISTER_DRAFT_KEY);
      this.router.navigate([response?.redirectTo || this.auth.getHomeRoute()]);
    } catch (err: any) {
      this.feedback.showError(err?.error?.msg || 'OTP verification failed.');
    } finally {
      this.loading = false;
    }
  }

  async onResendOtp(event: Event) {
    event.preventDefault();
    if (this.isResending || this.resendCooldown > 0) {
      return;
    }

    if (!this.email) {
      this.feedback.showError('Email not found. Please register again.');
      this.router.navigate(['/register']);
      return;
    }

    this.isResending = true;
    try {
      const response = await firstValueFrom(this.auth.resendOtp({ email: this.email }));
      this.feedback.showMessage(response?.msg || 'OTP resent to email.', 'success');
      this.startResendCooldown(60);
    } catch (err: any) {
      this.feedback.showError(err?.error?.msg || 'Failed to resend OTP.');
    } finally {
      this.isResending = false;
    }
  }

  private startResendCooldown(seconds: number) {
    this.resendCooldown = seconds;
    if (this.resendTimer) {
      clearInterval(this.resendTimer);
    }

    this.resendTimer = setInterval(() => {
      this.resendCooldown -= 1;
      if (this.resendCooldown <= 0 && this.resendTimer) {
        clearInterval(this.resendTimer);
        this.resendTimer = null;
      }
    }, 1000);
  }

  ngOnDestroy() {
    if (this.resendTimer) {
      clearInterval(this.resendTimer);
      this.resendTimer = null;
    }
  }
}
