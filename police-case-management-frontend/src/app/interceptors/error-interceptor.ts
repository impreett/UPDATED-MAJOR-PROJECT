import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError, TimeoutError, timeout } from 'rxjs';
import { AppFeedbackService } from '../services/app-feedback.service';
import { AuthService } from '../services/auth';

const REQUEST_TIMEOUT_MS = 20000;

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const auth = inject(AuthService);
  const feedback = inject(AppFeedbackService);

  return next(req).pipe(
    timeout(REQUEST_TIMEOUT_MS),
    catchError((error: unknown) => {
      if (error instanceof TimeoutError) {
        feedback.showError('This request timed out. Please try again.');
        return throwError(() => error);
      }

      if (error instanceof HttpErrorResponse) {
        const backendMessage = normalizeServerMessage(error);

        if (error.status === 0) {
          feedback.showError('Unable to reach the server. Check your connection and try again.');
          return throwError(() => error);
        }

        if (error.status === 401) {
          auth.clearToken();
          router.navigate(['/login']);
          feedback.showError(backendMessage || 'Your session has expired. Please log in again.');
          return throwError(() => error);
        }

        if (error.status === 403) {
          feedback.showError(backendMessage || 'You do not have permission to access this resource.');
          return throwError(() => error);
        }

        if (error.status === 404) {
          feedback.showError(backendMessage || 'We could not find what you requested.');
          return throwError(() => error);
        }

        if (error.status >= 500) {
          feedback.showError(backendMessage || 'Server error. Please try again shortly.');
          return throwError(() => error);
        }

        if (backendMessage) {
          feedback.showError(backendMessage);
        }
      }

      return throwError(() => error);
    })
  );
};

function normalizeServerMessage(error: HttpErrorResponse): string {
  if (!error) return '';
  const raw =
    (typeof error.error === 'string' ? error.error : '') ||
    error.error?.msg ||
    error.error?.message ||
    error.error?.error ||
    '';
  return typeof raw === 'string' ? raw.trim() : '';
}
