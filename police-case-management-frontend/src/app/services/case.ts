import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE } from './config';

@Injectable({
  providedIn: 'root',
})
export class CaseService {
  private readonly defaultListLimit = 0;

  constructor(private http: HttpClient) {}

  private withPagination(params?: Record<string, string | number | undefined>) {
    return {
      page: 1,
      limit: this.defaultListLimit,
      ...(params || {}),
    };
  }

  getCases(params?: { field?: string; query?: string; page?: number; limit?: number }) {
    return this.http.get<any[]>(`${API_BASE}/cases`, {
      params: this.withPagination(params),
    });
  }

  getCompletedCases() {
    return this.http.get<any[]>(`${API_BASE}/cases/completed`, {
      params: this.withPagination(),
    });
  }

  getAssignedCases() {
    return this.http.get<any[]>(`${API_BASE}/cases/me/assigned`, {
      params: this.withPagination(),
    });
  }

  getCitizenCaseStatus() {
    return this.http.get<any[]>(`${API_BASE}/cases/citizen/status`, {
      params: this.withPagination(),
    });
  }

  getInspectorCitizenSubmissions() {
    return this.http.get<any[]>(`${API_BASE}/cases/inspector/citizen-submissions`, {
      params: this.withPagination(),
    });
  }

  getCaseById(id: string) {
    return this.http.get<any>(`${API_BASE}/cases/${id}`);
  }

  addCase(payload: any) {
    return this.http.post(`${API_BASE}/cases`, payload);
  }

  submitCitizenCase(payload: FormData) {
    return this.http.post(`${API_BASE}/cases/citizen-submit`, payload);
  }

  getCitizenCaseForEdit(id: string) {
    return this.http.get<any>(`${API_BASE}/cases/citizen/${id}`);
  }

  updateCitizenCase(id: string, payload: FormData) {
    return this.http.put<{ msg: string; case?: any }>(`${API_BASE}/cases/citizen/${id}`, payload);
  }

  withdrawCitizenCase(id: string) {
    return this.http.delete<{ msg: string }>(`${API_BASE}/cases/citizen/${id}`);
  }

  markCitizenCaseFake(id: string) {
    return this.http.put(`${API_BASE}/cases/inspector/citizen-submissions/${id}/mark-fake`, {});
  }

  sendCitizenCaseToCommissionerReview(id: string) {
    return this.http.put(
      `${API_BASE}/cases/inspector/citizen-submissions/${id}/send-commissioner-review`,
      {}
    );
  }

  addCitizenSubmissionAsCase(id: string) {
    return this.http.put(`${API_BASE}/cases/inspector/citizen-submissions/${id}/add-as-case`, {});
  }

  acceptCitizenSubmission(id: string, payload: FormData) {
    return this.http.put(`${API_BASE}/cases/inspector/citizen-submissions/${id}/add-as-case`, payload);
  }

  requestUpdate(payload: any) {
    return this.http.post(`${API_BASE}/cases/request-update`, payload);
  }

  updateCase(id: string, payload: any) {
    return this.http.put(`${API_BASE}/cases/${id}`, payload);
  }

  removeCase(id: string) {
    return this.http.delete(`${API_BASE}/cases/${id}`);
  }

  restoreCase(id: string) {
    return this.http.put(`${API_BASE}/cases/${id}/restore`, {});
  }

  getInspectors(options?: { includeSuspended?: boolean }) {
    return this.http.get<any[]>(`${API_BASE}/users/inspectors`, {
      params: this.withPagination({
        limit: 200,
        includeSuspended: options?.includeSuspended ? 1 : undefined,
      }),
    });
  }

  // Backward-compatible alias
  getOfficers(options?: { includeSuspended?: boolean }) {
    return this.getInspectors(options);
  }
}
