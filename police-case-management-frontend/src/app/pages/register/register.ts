import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Footer } from '../../components/footer/footer';
import { AppFeedbackService } from '../../services/app-feedback.service';
import { AuthService } from '../../services/auth';
import { CITY_OPTIONS } from '../../utils/city-options';

type RegisterRole = 'inspector' | 'citizen';

type RegisterErrors = {
  fullname?: string;
  police_id?: string;
  first_name?: string;
  last_name?: string;
  contact?: string;
  email?: string;
  city?: string;
  age?: string;
  aadhar_number?: string;
  password?: string;
  conf_password?: string;
  term_of_use?: string;
};

const REGISTER_DRAFT_KEY = 'pcm_register_draft';
const OTP_PENDING_EMAIL_KEY = 'pcm_pending_otp_email';
const OTP_PENDING_ROLE_KEY = 'pcm_pending_otp_role';

@Component({
  selector: 'app-register',
  imports: [CommonModule, ReactiveFormsModule, RouterLink, Footer],
  templateUrl: './register.html',
  styleUrl: './register.css',
})
export class Register implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  readonly cityOptions = CITY_OPTIONS;
  registerForm = this.fb.nonNullable.group({
    role_type: 'inspector' as RegisterRole,
    fullname: '',
    police_id: '',
    first_name: '',
    last_name: '',
    contact: '',
    email: '',
    city: '',
    age: '',
    aadhar_number: '',
    password: '',
    conf_password: '',
    term_of_use: false,
  });
  errors: RegisterErrors = {};
  loading = false;
  showPassword = false;
  showConfirmPassword = false;
  private shouldPersistDraftOnDestroy = true;

  constructor(
    private auth: AuthService,
    private router: Router,
    private feedback: AppFeedbackService
  ) {}

  ngOnInit() {
    this.restoreDraft();
  }

  ngOnDestroy() {
    if (this.shouldPersistDraftOnDestroy) {
      this.persistDraft();
    }
  }

  get selectedRole(): RegisterRole {
    return this.registerForm.controls.role_type.value;
  }

  setRole(role: RegisterRole) {
    this.registerForm.controls.role_type.setValue(role);
    this.errors = {};
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPasswordVisibility() {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  validate() {
    const data = this.registerForm.getRawValue();
    const errs: RegisterErrors = {};
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const policeEmailRe = /^[^\s@]+@police\.gov\.in$/i;
    const nameRe = /^[A-Za-z\s]+$/;

    if (data.role_type === 'inspector') {
      if (!data.fullname.trim()) errs.fullname = 'Please enter inspector full name.';
      else if (!nameRe.test(data.fullname.trim())) errs.fullname = 'Only letters and spaces are allowed.';
      if (!/^[A-Za-z0-9]{8}$/.test(data.police_id.trim())) {
        errs.police_id = 'Badge ID must be exactly 8 alphanumeric characters.';
      }
      if (!policeEmailRe.test(data.email.trim())) {
        errs.email = 'Inspector email must be a valid @police.gov.in address.';
      }
    } else {
      if (!data.first_name.trim()) errs.first_name = 'Please enter first name.';
      else if (!/^[A-Za-z]+$/.test(data.first_name.trim()))
        errs.first_name = 'First name must contain letters only.';
      if (!data.last_name.trim()) errs.last_name = 'Please enter last name.';
      else if (!/^[A-Za-z]+$/.test(data.last_name.trim()))
        errs.last_name = 'Last name must contain letters only.';
      const ageNum = Number(data.age);
      if (!Number.isFinite(ageNum) || ageNum < 18 || ageNum > 110) {
        errs.age = 'Age must be between 18 and 110.';
      }
      if (!/^\d{12}$/.test(data.aadhar_number.trim())) {
        errs.aadhar_number = 'Aadhar card number must be exactly 12 digits.';
      }
      if (!emailRe.test(data.email.trim())) {
        errs.email = 'Please enter a valid email address.';
      }
    }

    if (!/^\d{10}$/.test(data.contact.trim())) {
      errs.contact = 'Mobile number must be exactly 10 digits.';
    }
    if (!data.city.trim()) {
      errs.city = 'Please enter city.';
    }
    if (data.password.length < 8) {
      errs.password = 'Password must be at least 8 characters.';
    }
    if (data.conf_password !== data.password) {
      errs.conf_password = 'Passwords do not match.';
    }
    if (!data.term_of_use) {
      errs.term_of_use = 'Please accept Terms & Conditions to continue.';
    }

    this.errors = errs;
    return Object.keys(errs).length === 0;
  }

  async onSubmit() {
    if (!this.validate() || this.loading) return;
    this.loading = true;
    try {
      const data = this.registerForm.getRawValue();
      const normalizedEmail = data.email.trim().toLowerCase();

      if (data.role_type === 'inspector') {
        await firstValueFrom(
          this.auth.registerInspector({
            fullname: data.fullname.trim().toUpperCase(),
            police_id: data.police_id.trim(),
            contact: data.contact.trim(),
            email: normalizedEmail,
            city: data.city.trim(),
            password: data.password,
          })
        );
      } else {
        await firstValueFrom(
          this.auth.registerCitizen({
            first_name: data.first_name.trim(),
            last_name: data.last_name.trim(),
            email: normalizedEmail,
            contact: data.contact.trim(),
            city: data.city.trim(),
            age: Number(data.age),
            aadhar_number: data.aadhar_number.trim(),
            password: data.password,
          })
        );
      }

      this.persistDraft();
      sessionStorage.setItem(OTP_PENDING_EMAIL_KEY, normalizedEmail);
      sessionStorage.setItem(OTP_PENDING_ROLE_KEY, data.role_type);
      this.router.navigate(['/otp-page'], {
        queryParams: { email: normalizedEmail, role: data.role_type },
      });
    } catch (err: any) {
      this.feedback.showError(err?.error?.msg || 'Error registering.');
    } finally {
      this.loading = false;
    }
  }

  private persistDraft() {
    try {
      sessionStorage.setItem(REGISTER_DRAFT_KEY, JSON.stringify(this.registerForm.getRawValue()));
    } catch {
      // Ignore storage errors.
    }
  }

  private clearDraft() {
    try {
      sessionStorage.removeItem(REGISTER_DRAFT_KEY);
    } catch {
      // Ignore storage errors.
    }
  }

  private restoreDraft() {
    try {
      const raw = sessionStorage.getItem(REGISTER_DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      this.registerForm.reset({
        role_type: parsed.role_type === 'citizen' ? 'citizen' : 'inspector',
        fullname: typeof parsed.fullname === 'string' ? parsed.fullname : '',
        police_id: typeof parsed.police_id === 'string' ? parsed.police_id : '',
        first_name: typeof parsed.first_name === 'string' ? parsed.first_name : '',
        last_name: typeof parsed.last_name === 'string' ? parsed.last_name : '',
        contact: typeof parsed.contact === 'string' ? parsed.contact : '',
        email: typeof parsed.email === 'string' ? parsed.email : '',
        city: typeof parsed.city === 'string' ? parsed.city : '',
        age: typeof parsed.age === 'string' ? parsed.age : '',
        aadhar_number: typeof parsed.aadhar_number === 'string' ? parsed.aadhar_number : '',
        password: typeof parsed.password === 'string' ? parsed.password : '',
        conf_password: typeof parsed.conf_password === 'string' ? parsed.conf_password : '',
        term_of_use: Boolean(parsed.term_of_use),
      });
    } catch {
      this.clearDraft();
    }
  }
}
