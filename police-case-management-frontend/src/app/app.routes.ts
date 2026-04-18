import { Routes } from '@angular/router';
import { MainLayout } from './components/main-layout/main-layout';
import { authGuard } from './guards/auth-guard';
import { adminGuard } from './guards/admin-guard';
import { citizenGuard } from './guards/citizen-guard';
import { inspectorGuard } from './guards/inspector-guard';
import { loginGuard } from './guards/login-guard';

import { Home } from './pages/home/home';
import { AdminHome } from './pages/admin-home/admin-home';
import { AddCase } from './pages/add-case/add-case';
import { UpdateCaseList } from './pages/update-case-list/update-case-list';
import { UpdateForm } from './pages/update-form/update-form';
import { CaseDetails } from './pages/case-details/case-details';
import { SearchCase } from './pages/search-case/search-case';
import { ReportIssue } from './pages/report-issue/report-issue';
import { PublicReport } from './pages/public-report/public-report';
import { Terms } from './pages/terms/terms';
import { Login } from './pages/login/login';
import { Register } from './pages/register/register';
import { OtpPage } from './pages/otp-page/otp-page';
import { PendingUsers } from './pages/pending-users/pending-users';
import { ActiveUsers } from './pages/active-users/active-users';
import { ViewReports } from './pages/view-reports/view-reports';
import { PendingCases } from './pages/pending-cases/pending-cases';
import { PendingUpdates } from './pages/pending-updates/pending-updates';
import { CheckSideBySide } from './pages/check-side-by-side/check-side-by-side';
import { AdminUpdateCase } from './pages/admin-update-case/admin-update-case';
import { AdminUpdateForm } from './pages/admin-update-form/admin-update-form';
import { AdminRemoveCase } from './pages/admin-remove-case/admin-remove-case';
import { AdminRemovedCases } from './pages/admin-removed-cases/admin-removed-cases';
import { ForgotPassword } from './pages/forgot-password/forgot-password';
import { CitizenSubmitCase } from './pages/citizen-submit-case/citizen-submit-case';
import { CitizenCaseStatus } from './pages/citizen-case-status/citizen-case-status';
import { CitizenComplaints } from './pages/citizen-complaints/citizen-complaints';
import { CitizenComplaintEdit } from './pages/citizen-complaint-edit/citizen-complaint-edit';
import { CitizenComplaintDetail } from './pages/citizen-complaint-detail/citizen-complaint-detail';
import { CitizenEditCase } from './pages/citizen-edit-case/citizen-edit-case';
import { ReportPoliceInspector } from './pages/report-police-inspector/report-police-inspector';
import { InspectorCompliance } from './pages/inspector-compliance/inspector-compliance';
import { InspectorComplianceDetail } from './pages/inspector-compliance-detail/inspector-compliance-detail';
import { InspectorCitizenSubmissions } from './pages/inspector-citizen-submissions/inspector-citizen-submissions';
import { IssueFine } from './pages/issue-fine/issue-fine';
import { Settings } from './pages/settings/settings';
import { CitizenPayFine } from './pages/citizen-pay-fine/citizen-pay-fine';
import { CitizenFineDetail } from './pages/citizen-fine-detail/citizen-fine-detail';
import { InspectorCaseTransfer } from './pages/inspector-case-transfer/inspector-case-transfer';
import { AdminCaseTransferRequests } from './pages/admin-case-transfer-requests/admin-case-transfer-requests';
import { AdminCitizenSubmissions } from './pages/admin-citizen-submissions/admin-citizen-submissions';
import { AdminManageFine } from './pages/admin-manage-fine/admin-manage-fine';
import { AdminFineDetail } from './pages/admin-fine-detail/admin-fine-detail';

export const routes: Routes = [
  { path: 'login', component: Login, canActivate: [loginGuard] },
  { path: 'register', component: Register, canActivate: [loginGuard] },
  { path: 'otp-page', component: OtpPage, canActivate: [loginGuard] },
  { path: 'forgot-password', component: ForgotPassword },
  { path: 'report-issue', component: PublicReport },
  { path: 'terms', component: Terms },
  { path: '', pathMatch: 'full', redirectTo: 'inspector/home' },
  {
    path: '',
    component: MainLayout,
    canActivate: [authGuard],
    children: [
      // Inspector routes
      { path: 'inspector/home', component: Home, canActivate: [inspectorGuard] },
      { path: 'inspector/add-case', component: AddCase, canActivate: [inspectorGuard] },
      { path: 'inspector/update-case', component: UpdateCaseList, canActivate: [inspectorGuard] },
      { path: 'inspector/update-form/:id', component: UpdateForm, canActivate: [inspectorGuard] },
      { path: 'inspector/search-case', component: SearchCase, canActivate: [inspectorGuard] },
      {
        path: 'inspector/citizen-submissions',
        component: InspectorCitizenSubmissions,
        canActivate: [inspectorGuard],
      },
      { path: 'inspector/issue-fine', component: IssueFine, canActivate: [inspectorGuard] },
      {
        path: 'inspector/request-case-transfer',
        component: InspectorCaseTransfer,
        canActivate: [inspectorGuard],
      },
      { path: 'inspector/report', component: ReportIssue, canActivate: [inspectorGuard] },

      // Citizen routes
      { path: 'citizen/submit-case', component: CitizenSubmitCase, canActivate: [citizenGuard] },
      { path: 'citizen/case-status', component: CitizenCaseStatus, canActivate: [citizenGuard] },
      { path: 'citizen/edit-case/:id', component: CitizenEditCase, canActivate: [citizenGuard] },
      { path: 'citizen/complaints', component: CitizenComplaints, canActivate: [citizenGuard] },
      { path: 'citizen/pay-fine', component: CitizenPayFine, canActivate: [citizenGuard] },
      { path: 'citizen/fine/:fineId', component: CitizenFineDetail, canActivate: [citizenGuard] },
      {
        path: 'citizen/complaints/:complaintId/edit',
        component: CitizenComplaintEdit,
        canActivate: [citizenGuard],
      },
      {
        path: 'citizen/complaints/:complaintId',
        component: CitizenComplaintDetail,
        canActivate: [citizenGuard],
      },
      {
        path: 'citizen/report-inspector',
        component: ReportPoliceInspector,
        canActivate: [citizenGuard],
      },
      { path: 'citizen/report', component: ReportIssue, canActivate: [citizenGuard] },

      // Commissioner routes
      { path: 'commissioner/home', component: AdminHome, canActivate: [adminGuard] },
      { path: 'commissioner/add-case', component: AddCase, canActivate: [adminGuard] },
      { path: 'commissioner/search-case', component: SearchCase, canActivate: [adminGuard] },
      { path: 'commissioner/update-case', component: AdminUpdateCase, canActivate: [adminGuard] },
      { path: 'commissioner/update-form/:id', component: AdminUpdateForm, canActivate: [adminGuard] },
      { path: 'commissioner/remove-case', component: AdminRemoveCase, canActivate: [adminGuard] },
      { path: 'commissioner/manage-fine', component: AdminManageFine, canActivate: [adminGuard] },
      { path: 'commissioner/fine/:fineId', component: AdminFineDetail, canActivate: [adminGuard] },
      {
        path: 'commissioner/removed-cases',
        component: AdminRemovedCases,
        canActivate: [adminGuard],
      },
      { path: 'commissioner/pending-cases', component: PendingCases, canActivate: [adminGuard] },
      {
        path: 'commissioner/suspended-inspectors',
        component: PendingUsers,
        canActivate: [adminGuard],
      },
      {
        path: 'commissioner/active-inspectors',
        component: ActiveUsers,
        canActivate: [adminGuard],
      },
      {
        path: 'commissioner/case-transfer-requests',
        component: AdminCaseTransferRequests,
        canActivate: [adminGuard],
      },
      {
        path: 'commissioner/citizen-submissions',
        component: AdminCitizenSubmissions,
        canActivate: [adminGuard],
      },
      { path: 'commissioner/reports', component: ViewReports, canActivate: [adminGuard] },
      {
        path: 'commissioner/pending-updates',
        component: PendingUpdates,
        canActivate: [adminGuard],
      },
      {
        path: 'commissioner/check-side-by-side/:updateId',
        component: CheckSideBySide,
        canActivate: [adminGuard],
      },
      {
        path: 'commissioner/inspector-compliance',
        component: InspectorCompliance,
        canActivate: [adminGuard],
      },
      {
        path: 'commissioner/inspector-compliance/:complaintId',
        component: InspectorComplianceDetail,
        canActivate: [adminGuard],
      },

      // Shared authenticated routes
      { path: 'settings', component: Settings },
      { path: 'case/:id', component: CaseDetails },

      // Legacy aliases (backward compatible links)
      { path: 'add', pathMatch: 'full', redirectTo: 'inspector/add-case' },
      { path: 'update', pathMatch: 'full', redirectTo: 'inspector/update-case' },
      { path: 'update-form/:id', pathMatch: 'full', redirectTo: 'inspector/update-form/:id' },
      { path: 'search', pathMatch: 'full', redirectTo: 'inspector/search-case' },
      { path: 'report', pathMatch: 'full', redirectTo: 'inspector/report' },
      { path: 'admin/home', pathMatch: 'full', redirectTo: 'commissioner/home' },
      {
        path: 'admin/pending-users',
        pathMatch: 'full',
        redirectTo: 'commissioner/suspended-inspectors',
      },
      {
        path: 'admin/active-users',
        pathMatch: 'full',
        redirectTo: 'commissioner/active-inspectors',
      },
      { path: 'admin/reports', pathMatch: 'full', redirectTo: 'commissioner/reports' },
      { path: 'admin/pending-cases', pathMatch: 'full', redirectTo: 'commissioner/pending-cases' },
      {
        path: 'admin/pending-updates',
        pathMatch: 'full',
        redirectTo: 'commissioner/pending-updates',
      },
      {
        path: 'admin/check-side-by-side/:updateId',
        pathMatch: 'full',
        redirectTo: 'commissioner/check-side-by-side/:updateId',
      },
      { path: 'admin/add-case', pathMatch: 'full', redirectTo: 'commissioner/add-case' },
      { path: 'admin/update-case', pathMatch: 'full', redirectTo: 'commissioner/update-case' },
      { path: 'admin/update-form/:id', pathMatch: 'full', redirectTo: 'commissioner/update-form/:id' },
      { path: 'admin/remove-case', pathMatch: 'full', redirectTo: 'commissioner/remove-case' },
      {
        path: 'admin/AdminRemovedCasesPage',
        pathMatch: 'full',
        redirectTo: 'commissioner/removed-cases',
      },
      {
        path: 'admin/citizen-submissions',
        pathMatch: 'full',
        redirectTo: 'commissioner/citizen-submissions',
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
