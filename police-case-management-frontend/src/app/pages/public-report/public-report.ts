import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Footer } from '../../components/footer/footer';
import { AppFeedbackService } from '../../services/app-feedback.service';
import { ReportService } from '../../services/report';

type PublicReportErrors = {
  email?: string;
  reportText?: string;
};

@Component({
  selector: 'app-public-report',
  imports: [CommonModule, ReactiveFormsModule, Footer],
  templateUrl: './public-report.html',
  styleUrl: './public-report.css',
})
export class PublicReport {
  private readonly fb = inject(FormBuilder);
  publicReportForm = this.fb.nonNullable.group({
    email: '',
    reportText: '',
  });
  errors: PublicReportErrors = {};

  constructor(
    private reportService: ReportService,
    private router: Router,
    private feedback: AppFeedbackService
  ) {}

  validate() {
    const formData = this.publicReportForm.getRawValue();
    const next: PublicReportErrors = {};
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email) next.email = 'Please enter your email.';
    else if (!emailRe.test(formData.email)) next.email = 'Enter a valid email address.';
    if (!formData.reportText) next.reportText = 'Please describe your issue.';
    else if ((formData.reportText || '').length < 50)
      next.reportText = 'Report must be at least 50 characters long.';
    this.errors = next;
    return Object.keys(next).length === 0;
  }

  async onSubmit() {
    if (!this.validate()) return;
    try {
      await firstValueFrom(this.reportService.submitPublicReport(this.publicReportForm.getRawValue()));
      this.feedback.showMessage('Your report has been submitted successfully.', 'success');
      this.router.navigate(['/login']);
    } catch {
      this.feedback.showError('Error submitting report. Please try again.');
    }
  }

  goBack() {
    window.history.back();
  }
}
