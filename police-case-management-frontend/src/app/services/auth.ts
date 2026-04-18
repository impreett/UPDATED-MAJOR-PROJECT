import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { jwtDecode } from 'jwt-decode';
import { API_BASE } from './config';

export type AppRole = 'commissioner' | 'inspector' | 'citizen';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly tokenKey = 'token';
  private readonly sessionTokenKey = 'session_token';

  constructor(private http: HttpClient) {}

  login(payload: { email: string; password: string }) {
    return this.http.post<{ token: string; role?: AppRole; redirectTo?: string }>(
      `${API_BASE}/auth/login`,
      payload
    );
  }

  registerInspector(payload: {
    fullname: string;
    police_id: string;
    contact: string;
    email: string;
    city: string;
    password: string;
  }) {
    return this.http.post<{ msg: string; email?: string; role?: AppRole }>(
      `${API_BASE}/auth/register-inspector`,
      payload
    );
  }

  registerCitizen(payload: {
    first_name: string;
    last_name: string;
    email: string;
    contact: string;
    city: string;
    age: number;
    aadhar_number: string;
    password: string;
  }) {
    return this.http.post<{ msg: string; email?: string; role?: AppRole }>(
      `${API_BASE}/auth/register-citizen`,
      payload
    );
  }

  // Backward-compatible wrapper
  register(payload: {
    fullname: string;
    police_id: string;
    contact: string;
    email: string;
    city: string;
    password: string;
  }) {
    return this.registerInspector(payload);
  }

  verifyRegistrationOtp(payload: { email: string; otp: string }) {
    return this.http.post<{ msg: string; token?: string; role?: AppRole; redirectTo?: string }>(
      `${API_BASE}/auth/verify-registration-otp`,
      payload
    );
  }

  verifyOtp(payload: { email: string; otp: string }) {
    return this.verifyRegistrationOtp(payload);
  }

  resendRegistrationOtp(payload: { email: string }) {
    return this.http.post<{ msg: string }>(`${API_BASE}/auth/resend-registration-otp`, payload);
  }

  resendOtp(payload: { email: string }) {
    return this.resendRegistrationOtp(payload);
  }

  requestForgotPasswordOtp(payload: { email: string }) {
    return this.http.post<{ msg: string }>(`${API_BASE}/auth/forgot-password/request`, payload);
  }

  verifyForgotPasswordOtp(payload: { email: string; otp: string }) {
    return this.http.post<{ msg: string; resetToken: string }>(
      `${API_BASE}/auth/forgot-password/verify`,
      payload
    );
  }

  resetPassword(payload: { email: string; resetToken: string; newPassword: string }) {
    return this.http.post<{ msg: string }>(`${API_BASE}/auth/forgot-password/reset`, payload);
  }

  getProfile() {
    return this.http.get<{ user: any }>(`${API_BASE}/auth/me`);
  }

  updateProfile(payload: Record<string, unknown>) {
    return this.http.patch<{ msg: string; token?: string; user?: any }>(`${API_BASE}/auth/me`, payload);
  }

  changePassword(payload: { currentPassword: string; newPassword: string }) {
    return this.http.post<{ msg: string }>(`${API_BASE}/auth/change-password`, payload);
  }

  getToken() {
    return localStorage.getItem(this.tokenKey) || sessionStorage.getItem(this.sessionTokenKey);
  }

  setToken(token: string, rememberMe = true) {
    if (rememberMe) {
      localStorage.setItem(this.tokenKey, token);
      sessionStorage.removeItem(this.sessionTokenKey);
      return;
    }
    sessionStorage.setItem(this.sessionTokenKey, token);
    localStorage.removeItem(this.tokenKey);
  }

  clearToken() {
    localStorage.removeItem(this.tokenKey);
    sessionStorage.removeItem(this.sessionTokenKey);
  }

  storeTokenPreservingPreference(token: string) {
    const hasPersistentToken = !!localStorage.getItem(this.tokenKey);
    const hasSessionToken = !!sessionStorage.getItem(this.sessionTokenKey);
    const rememberMe = hasPersistentToken || !hasSessionToken;
    this.setToken(token, rememberMe);
  }

  getUser(): any | null {
    const token = this.getToken();
    if (!token) return null;
    try {
      const decoded: any = jwtDecode(token);
      const user = decoded?.user ?? decoded ?? null;
      if (!user) return null;
      const inferredRole =
        user.role ||
        (user.isCommissioner || user.isAdmin
          ? 'commissioner'
          : user.isCitizen
            ? 'citizen'
            : 'inspector');
      user.role = inferredRole;
      user.isAdmin = inferredRole === 'commissioner';
      user.isCommissioner = inferredRole === 'commissioner';
      user.isCitizen = inferredRole === 'citizen';
      return user;
    } catch {
      return null;
    }
  }

  getRole(): AppRole | null {
    const role = this.getUser()?.role;
    if (role === 'commissioner' || role === 'inspector' || role === 'citizen') return role;
    return null;
  }

  getHomeRoute(): string {
    const role = this.getRole();
    if (role === 'commissioner') return '/commissioner/home';
    if (role === 'citizen') return '/citizen/case-status';
    return '/inspector/home';
  }

  isLoggedIn() {
    return !!this.getToken();
  }

  isCommissioner() {
    return this.getRole() === 'commissioner';
  }

  isInspector() {
    return this.getRole() === 'inspector';
  }

  isCitizen() {
    return this.getRole() === 'citizen';
  }

  // Backward-compatible method name used in older components
  isAdmin() {
    return this.isCommissioner();
  }
}
