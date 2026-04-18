import { CommonModule } from '@angular/common';
import { Component, ViewEncapsulation } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-navbar',
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
  encapsulation: ViewEncapsulation.None,
})
export class Navbar {
  constructor(
    public auth: AuthService,
    public theme: ThemeService
  ) {}

  get user() {
    return this.auth.getUser();
  }

  get role() {
    return this.auth.getRole();
  }

  get isDarkMode() {
    return this.theme.isDarkMode();
  }

  toggleDarkMode() {
    this.theme.toggle();
  }
}
