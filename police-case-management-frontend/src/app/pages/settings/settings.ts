import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, AppRole } from '../../services/auth';
import { AppFeedbackService } from '../../services/app-feedback.service';
import { firstValueFrom } from 'rxjs';
import { CITY_OPTIONS } from '../../utils/city-options';
import { ForgotPassword } from '../forgot-password/forgot-password';

type ProfileField = 'fullname' | 'first_name' | 'last_name' | 'contact' | 'city' | 'age';
type PasswordField = 'currentPassword' | 'newPassword' | 'confirmPassword';

const FULLNAME_REGEX = /^[A-Za-z\s]+$/;
const NAME_REGEX = /^[A-Za-z]+$/;
const PHONE_REGEX = /^\d{10}$/;

function passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
  const newPassword = String(control.get('newPassword')?.value || '');
  const confirmPassword = String(control.get('confirmPassword')?.value || '');
  if (!newPassword || !confirmPassword) return null;
  return newPassword === confirmPassword ? null : { passwordMismatch: true };
}

@Component({
  selector: 'app-settings',
  imports: [CommonModule, ReactiveFormsModule, ForgotPassword],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class Settings implements OnInit {
  private readonly fb = inject(FormBuilder);
  readonly cityOptions = CITY_OPTIONS;
  loading = true;
  savingProfile = false;
  changingPassword = false;
  profileSubmitted = false;
  passwordSubmitted = false;
  role: AppRole | null = null;
  profile: any = null;
  showForgotPassword = false;
  showCurrentPassword = false;
  showNewPassword = false;
  showConfirmPassword = false;

  profileForm = this.fb.nonNullable.group({
    fullname: this.fb.nonNullable.control('', []),
    first_name: this.fb.nonNullable.control('', []),
    last_name: this.fb.nonNullable.control('', []),
    email: this.fb.nonNullable.control('', []),
    contact: this.fb.nonNullable.control('', [Validators.required, Validators.pattern(PHONE_REGEX)]),
    city: this.fb.nonNullable.control('', [Validators.required]),
    age: this.fb.nonNullable.control('', []),
    police_id: this.fb.nonNullable.control('', []),
  });

  passwordForm = this.fb.nonNullable.group(
    {
      currentPassword: this.fb.nonNullable.control('', [Validators.required]),
      newPassword: this.fb.nonNullable.control('', [Validators.required, Validators.minLength(8)]),
      confirmPassword: this.fb.nonNullable.control('', [Validators.required]),
    },
    { validators: [passwordMatchValidator] }
  );

  constructor(
    private auth: AuthService,
    private feedback: AppFeedbackService,
    private router: Router
  ) {}

  async ngOnInit() {
    try {
      const response = await firstValueFrom(this.auth.getProfile());
      const user = response?.user || null;
      if (!user) {
        throw { status: 404, error: { msg: 'User not found.' } };
      }
      this.profile = user;
      this.role = user?.role || this.auth.getRole();
      this.applyProfileValidators();
      this.profileForm.patchValue({
        fullname: user?.fullname || '',
        first_name: user?.first_name || '',
        last_name: user?.last_name || '',
        email: user?.email || '',
        contact: user?.contact || '',
        city: user?.city || '',
        age: user?.age ? String(user.age) : '',
        police_id: user?.police_id || '',
      });
      this.profileForm.controls.contact.valueChanges.subscribe(() =>
        this.clearProfileServerError('contact')
      );
    } catch (err: any) {
      const status = err?.status;
      const serverMessage = err?.error?.msg || err?.error?.message || '';
      if (status === 401 || status === 404) {
        this.auth.clearToken();
        this.feedback.showError(
          serverMessage || 'Your session is no longer valid. Please log in again.'
        );
        this.router.navigate(['/login']);
      } else if (status === 0) {
        this.feedback.showError('Unable to reach the server. Please try again.');
      } else {
        this.feedback.showError(serverMessage || 'Failed to load your profile.');
      }
    } finally {
      this.loading = false;
    }
  }

  get isCitizen(): boolean {
    return this.role === 'citizen';
  }

  private applyProfileValidators() {
    if (this.isCitizen) {
      this.profileForm.controls.first_name.setValidators([Validators.required, Validators.pattern(NAME_REGEX)]);
      this.profileForm.controls.last_name.setValidators([Validators.required, Validators.pattern(NAME_REGEX)]);
      this.profileForm.controls.age.setValidators([Validators.required, Validators.min(18), Validators.max(110)]);
      this.profileForm.controls.fullname.clearValidators();
    } else {
      this.profileForm.controls.fullname.setValidators([Validators.required, Validators.pattern(FULLNAME_REGEX)]);
      this.profileForm.controls.first_name.clearValidators();
      this.profileForm.controls.last_name.clearValidators();
      this.profileForm.controls.age.clearValidators();
    }

    this.profileForm.controls.fullname.updateValueAndValidity({ emitEvent: false });
    this.profileForm.controls.first_name.updateValueAndValidity({ emitEvent: false });
    this.profileForm.controls.last_name.updateValueAndValidity({ emitEvent: false });
    this.profileForm.controls.age.updateValueAndValidity({ emitEvent: false });
  }

  isProfileFieldInvalid(field: ProfileField): boolean {
    const control = this.profileForm.get(field);
    if (!control) return false;
    return control.invalid && (control.touched || this.profileSubmitted);
  }

  getProfileError(field: ProfileField): string {
    const control = this.profileForm.get(field);
    if (!control) return '';
    if (control.hasError('server')) {
      return control.getError('server') || 'Invalid value.';
    }
    if (control.hasError('required')) {
      switch (field) {
        case 'fullname':
          return 'Full name is required.';
        case 'first_name':
          return 'First name is required.';
        case 'last_name':
          return 'Last name is required.';
        case 'contact':
          return 'Mobile number must be exactly 10 digits.';
        case 'city':
          return 'City is required.';
        case 'age':
          return 'Age is required.';
        default:
          return 'This field is required.';
      }
    }
    if (control.hasError('pattern')) {
      switch (field) {
        case 'fullname':
          return 'Full name must contain letters and spaces only.';
        case 'first_name':
          return 'First name must contain letters only.';
        case 'last_name':
          return 'Last name must contain letters only.';
        case 'contact':
          return 'Mobile number must be exactly 10 digits.';
        default:
          return 'Invalid format.';
      }
    }
    if (control.hasError('min') || control.hasError('max')) {
      return 'Age must be between 18 and 110.';
    }
    return '';
  }

  isPasswordFieldInvalid(field: PasswordField): boolean {
    const control = this.passwordForm.get(field);
    if (!control) return false;
    const touched = control.touched || this.passwordSubmitted;
    if (!touched) return false;
    if (control.invalid) return true;
    if (field === 'confirmPassword' && this.passwordForm.hasError('passwordMismatch')) return true;
    return false;
  }

  getPasswordError(field: PasswordField): string {
    const control = this.passwordForm.get(field);
    if (!control) return '';
    if (control.hasError('server')) {
      return control.getError('server') || 'Invalid value.';
    }
    if (control.hasError('required')) {
      if (field === 'currentPassword') return 'Current password is required.';
      if (field === 'newPassword') return 'New password is required.';
      return 'Confirm password is required.';
    }
    if (field === 'newPassword' && control.hasError('minlength')) {
      return 'New password must be at least 8 characters.';
    }
    if (field === 'confirmPassword' && this.passwordForm.hasError('passwordMismatch')) {
      return 'New password and confirm password must match.';
    }
    return '';
  }

  private normalizeText(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  async saveProfile() {
    if (this.savingProfile) return;
    this.clearProfileServerError('contact');
    this.profileSubmitted = true;
    this.profileForm.markAllAsTouched();
    if (this.profileForm.invalid) {
      return;
    }

    const raw = this.profileForm.getRawValue();
    const contact = this.normalizeText(raw.contact).replace(/\D/g, '');
    const city = this.normalizeText(raw.city);

    const payload: Record<string, unknown> = { contact, city };
    if (this.isCitizen) {
      const firstName = this.normalizeText(raw.first_name);
      const lastName = this.normalizeText(raw.last_name);
      const ageNum = Number(raw.age);
      payload['first_name'] = firstName;
      payload['last_name'] = lastName;
      payload['age'] = ageNum;
    } else {
      const fullname = this.normalizeText(raw.fullname);
      payload['fullname'] = fullname;
    }

    this.savingProfile = true;
    try {
      const response = await firstValueFrom(this.auth.updateProfile(payload));
      if (response?.token) {
        this.auth.storeTokenPreservingPreference(response.token);
      }
      this.profile = response?.user || this.profile;
      if (response?.user) {
        this.profileForm.patchValue({
          fullname: response.user.fullname || '',
          first_name: response.user.first_name || '',
          last_name: response.user.last_name || '',
          email: response.user.email || '',
          contact: response.user.contact || '',
          city: response.user.city || '',
          age: response.user.age ? String(response.user.age) : '',
          police_id: response.user.police_id || '',
        });
      }
      this.profileSubmitted = false;
      this.feedback.showMessage(response?.msg || 'Profile updated successfully.', 'success');
    } catch (err: any) {
      const message = err?.error?.msg || 'Failed to update profile.';
      if (message.toLowerCase().includes('mobile number')) {
        this.setProfileServerError('contact', message);
      }
      this.feedback.showError(message);
    } finally {
      this.savingProfile = false;
    }
  }

  async changePassword() {
    if (this.changingPassword) return;

    const raw = this.passwordForm.getRawValue();
    this.passwordSubmitted = true;
    this.passwordForm.markAllAsTouched();
    if (this.passwordForm.invalid) {
      return;
    }

    this.changingPassword = true;
    try {
      const response = await firstValueFrom(
        this.auth.changePassword({
          currentPassword: raw.currentPassword,
          newPassword: raw.newPassword,
        })
      );
      this.feedback.showMessage(response?.msg || 'Password changed successfully.', 'success');
      this.passwordForm.reset({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      this.passwordSubmitted = false;
    } catch (err: any) {
      const message = err?.error?.msg || 'Failed to change password.';
      if (message.toLowerCase().includes('current password')) {
        this.setPasswordServerError('currentPassword', message);
      } else if (message.toLowerCase().includes('new password')) {
        this.setPasswordServerError('newPassword', message);
      }
      this.feedback.showError(message);
    } finally {
      this.changingPassword = false;
    }
  }

  roleLabel(): string {
    if (this.role === 'commissioner') return 'Commissioner';
    if (this.role === 'citizen') return 'Citizen';
    return 'Inspector';
  }

  openForgotPassword(event?: Event) {
    if (event) event.preventDefault();
    this.showForgotPassword = true;
  }

  closeForgotPassword() {
    this.showForgotPassword = false;
  }

  private setProfileServerError(field: ProfileField, message: string) {
    const control = this.profileForm.get(field);
    if (!control) return;
    const existing = control.errors || {};
    control.setErrors({ ...existing, server: message });
    control.markAsTouched();
  }

  private clearProfileServerError(field: ProfileField) {
    const control = this.profileForm.get(field);
    if (!control?.errors?.['server']) return;
    const { server, ...rest } = control.errors || {};
    control.setErrors(Object.keys(rest).length ? rest : null);
  }

  private setPasswordServerError(field: PasswordField, message: string) {
    const control = this.passwordForm.get(field);
    if (!control) return;
    const existing = control.errors || {};
    control.setErrors({ ...existing, server: message });
    control.markAsTouched();
  }
}
