import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, Subscription } from 'rxjs';

@Component({
  selector: 'app-footer',
  imports: [CommonModule, RouterLink],
  templateUrl: './footer.html',
  styleUrl: './footer.css',
  encapsulation: ViewEncapsulation.None,
})
export class Footer implements OnInit, OnDestroy {
  showReportLink = false;
  private sub?: Subscription;

  constructor(private router: Router) {}

  ngOnInit() {
    this.updateReportLink(this.router.url);
    this.sub = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event) => {
        const nav = event as NavigationEnd;
        this.updateReportLink(nav.urlAfterRedirects || nav.url);
      });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  private updateReportLink(url: string) {
    this.showReportLink = url === '/login' || url === '/register';
  }
}
