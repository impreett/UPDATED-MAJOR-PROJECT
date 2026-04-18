import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth';
import { AppFeedbackService } from '../../services/app-feedback.service';
import { ReportService } from '../../services/report';

type ReportIssueErrors = {
  reportText?: string;
};

@Component({
  selector: 'app-report-issue',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './report-issue.html',
  styleUrl: './report-issue.css',
})
export class ReportIssue implements OnInit {
  private readonly fb = inject(FormBuilder);
  reportIssueForm = this.fb.nonNullable.group({
    reportText: '',
  });
  userEmail = '';
  tokenError = false;
  errors: ReportIssueErrors = {};

  constructor(
    private auth: AuthService,
    private reportService: ReportService,
    private router: Router,
    private feedback: AppFeedbackService
  ) {}

  ngOnInit() {
    const user = this.auth.getUser();
    if (user && user.email) {
      this.userEmail = user.email;
    } else {
      this.tokenError = true;
      this.userEmail = 'N/A - Your login session is outdated.';
    }
  }

  validate() {
    const reportText = this.reportIssueForm.controls.reportText.value;
    const tempErrors: ReportIssueErrors = {};
    if (!reportText || reportText.trim() === '') {
      tempErrors.reportText = 'Please describe your issue.';
    } else if (reportText.trim().length < 50) {
      tempErrors.reportText = 'Report must be at least 50 characters.';
    }
    this.errors = tempErrors;
    return Object.keys(tempErrors).length === 0;
  }

  async onSubmit() {
    if (this.tokenError) {
      this.feedback.showError('Your login session is outdated. Please log out and log in again to submit a report.');
      return;
    }
    if (!this.validate()) return;
    try {
      const reportText = this.reportIssueForm.controls.reportText.value;
      await firstValueFrom(
        this.reportService.submitReport({ email: this.userEmail, reportText })
      );
      this.feedback.showMessage('Your report has been submitted successfully.', 'success');
      this.router.navigate([this.auth.getHomeRoute()]);
    } catch (err: any) {
      console.error('Error details:', err?.error || err);
      this.feedback.showError(
        'Error submitting report: ' + (err?.error?.error || err?.error?.msg || err?.message)
      );
    }
  }
}
