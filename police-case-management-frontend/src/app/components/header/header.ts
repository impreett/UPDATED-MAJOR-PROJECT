import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { AuthService } from '../../services/auth';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-header',
  imports: [CommonModule, RouterLink],
  templateUrl: './header.html',
  styleUrl: './header.css',
  encapsulation: ViewEncapsulation.None,
})
export class Header implements OnInit, OnDestroy {
  private static readonly FALLBACK_HEADER_HEIGHT = 100;
  private navSub?: Subscription;

  private readonly onWheelListener = (event: WheelEvent) => {
    const isHeaderHidden = document.body.classList.contains('header-hidden');
    const maxScrollTop = this.getScrollRange();
    const minScrollRangeForToggle = this.getMinimumScrollRangeForToggle();

    // Hide header only if page can scroll at least one full header height.
    if (maxScrollTop < minScrollRangeForToggle) {
      if (isHeaderHidden) {
        this.setHeaderHidden(false);
      }
      return;
    }

    if (event.deltaY > 0 && !isHeaderHidden) {
      // First down scroll hides header/navbar before page scroll starts.
      event.preventDefault();
      this.setHeaderHidden(true);
      return;
    }

    if (event.deltaY < 0 && isHeaderHidden) {
      // First up scroll shows header/navbar before page scroll starts.
      event.preventDefault();
      this.setHeaderHidden(false);
    }
  };
  private readonly onResizeListener = () => this.ensureVisibleWhenPageIsShort();

  constructor(
    private router: Router,
    public auth: AuthService,
    public theme: ThemeService
  ) {}

  ngOnInit() {
    this.setHeaderHidden(false);
    window.addEventListener('wheel', this.onWheelListener, { passive: false });
    window.addEventListener('resize', this.onResizeListener);
    requestAnimationFrame(() => this.ensureVisibleWhenPageIsShort());
    this.navSub = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => {
        this.setHeaderHidden(false);
        // Run after route render so short pages never start with hidden header.
        requestAnimationFrame(() => this.ensureVisibleWhenPageIsShort());
      });
  }

  ngOnDestroy() {
    window.removeEventListener('wheel', this.onWheelListener);
    window.removeEventListener('resize', this.onResizeListener);
    this.navSub?.unsubscribe();
    document.body.classList.remove('header-hidden');
  }

  get user() {
    return this.auth.getUser();
  }

  get userName() {
    return this.user?.fullname || 'User';
  }

  logout() {
    this.auth.clearToken();
    this.router.navigate(['/login']);
  }

  get isDarkMode() {
    return this.theme.isDarkMode();
  }

  toggleDarkMode() {
    this.theme.toggle();
  }

  private setHeaderHidden(isHidden: boolean) {
    document.body.classList.toggle('header-hidden', isHidden);
  }

  private getScrollRange() {
    return Math.max(
      0,
      document.documentElement.scrollHeight - document.documentElement.clientHeight
    );
  }

  private ensureVisibleWhenPageIsShort() {
    if (this.getScrollRange() < this.getMinimumScrollRangeForToggle()) {
      this.setHeaderHidden(false);
    }
  }

  private getMinimumScrollRangeForToggle() {
    const headerEl = document.querySelector('header.site-header') as HTMLElement | null;
    const headerHeight = Math.ceil(headerEl?.getBoundingClientRect().height || 0);

    if (headerHeight > 0) {
      return headerHeight;
    }

    const cssVar = getComputedStyle(document.documentElement).getPropertyValue('--header-h').trim();
    const parsedCssHeight = Number.parseFloat(cssVar);
    if (Number.isFinite(parsedCssHeight) && parsedCssHeight > 0) {
      return Math.ceil(parsedCssHeight);
    }

    return Header.FALLBACK_HEADER_HEIGHT;
  }
}
