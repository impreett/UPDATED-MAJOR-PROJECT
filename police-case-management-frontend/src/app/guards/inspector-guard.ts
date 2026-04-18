import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';

export const inspectorGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isInspector()) {
    return true;
  }
  router.navigate([auth.getHomeRoute()]);
  return false;
};
