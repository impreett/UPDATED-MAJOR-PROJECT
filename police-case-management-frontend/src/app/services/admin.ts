import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE } from './config';

@Injectable({
  providedIn: 'root',
})
export class AdminService {
  private readonly commissionerBase = `${API_BASE}/commissioner`;
  private readonly defaultListLimit = 60;

  constructor(private http: HttpClient) {}

  private withPagination(params?: Record<string, string | number | undefined>) {
    return {
      page: 1,
      limit: this.defaultListLimit,
      ...(params || {}),
    };
  }

  getSuspendedInspectors() {
    return this.http.get<any[]>(`${this.commissionerBase}/suspended-inspectors`, {
      params: this.withPagination(),
    });
  }

  suspendInspector(id: string) {
    return this.http.put(`${this.commissionerBase}/suspend-inspector/${id}`, null);
  }

  unsuspendInspector(id: string) {
    return this.http.put(`${this.commissionerBase}/unsuspend-inspector/${id}`, null);
  }

  // Backward-compatible wrappers
  getPendingUsers() {
    return this.getSuspendedInspectors();
  }

  approveUser(id: string) {
    return this.unsuspendInspector(id);
  }

  denyUser(id: string) {
    return this.http.delete(`${this.commissionerBase}/deny-user/${id}`);
  }

  disableUser(id: string) {
    return this.suspendInspector(id);
  }

  getActiveUsers() {
    return this.http.get<any[]>(`${this.commissionerBase}/active-users`, {
      params: this.withPagination(),
    });
  }

  getAllCases() {
    return this.http.get<any[]>(`${this.commissionerBase}/all-cases`, {
      params: this.withPagination({ limit: 0 }),
    });
  }

  getPendingCases() {
    return this.http.get<any[]>(`${this.commissionerBase}/pending-cases`, {
      params: this.withPagination({ limit: 0 }),
    });
  }

  getCitizenSubmissions() {
    return this.http.get<any[]>(`${this.commissionerBase}/citizen-submissions`, {
      params: this.withPagination({ limit: 0 }),
    });
  }

  assignCitizenSubmission(caseId: string, inspectorId: string) {
    return this.http.put(`${this.commissionerBase}/citizen-submissions/${caseId}/assign-inspector`, {
      inspector_id: inspectorId,
    });
  }

  approveCase(id: string) {
    return this.http.put(`${this.commissionerBase}/approve-case/${id}`, null);
  }

  denyCase(id: string) {
    return this.http.delete(`${this.commissionerBase}/deny-case/${id}`);
  }

  getRemovedCases() {
    return this.http.get<any[]>(`${this.commissionerBase}/removed-cases`, {
      params: this.withPagination({ limit: 0 }),
    });
  }

  getPendingUpdates() {
    return this.http.get<any[]>(`${this.commissionerBase}/pending-updates`, {
      params: this.withPagination({ limit: 0 }),
    });
  }

  approveUpdate(id: string) {
    return this.http.put(`${this.commissionerBase}/approve-update/${id}`, null);
  }

  denyUpdate(id: string) {
    return this.http.delete(`${this.commissionerBase}/deny-update/${id}`);
  }

  searchCases(params: { field: string; query: string; page?: number; limit?: number }) {
    return this.http.get<any[]>(`${this.commissionerBase}/search-cases`, {
      params: this.withPagination({ ...params, limit: 0 }),
    });
  }

  getCaseById(id: string) {
    return this.http.get<any>(`${this.commissionerBase}/case/${id}`);
  }

  getInspectorCompliance(tab: 'new' | 'working' | 'done') {
    return this.http.get<any[]>(`${this.commissionerBase}/inspector-compliance`, {
      params: this.withPagination({ tab }),
    });
  }

  getInspectorComplaint(id: string) {
    return this.http.get<any>(`${this.commissionerBase}/inspector-compliance/${id}`);
  }

  markComplaintWorking(id: string) {
    return this.http.put(`${this.commissionerBase}/inspector-compliance/${id}/mark-working`, {});
  }

  rejectComplaint(id: string) {
    return this.http.put(`${this.commissionerBase}/inspector-compliance/${id}/reject`, {});
  }

  completeComplaint(id: string, commissioner_note: string) {
    return this.http.put(`${this.commissionerBase}/inspector-compliance/${id}/complete`, {
      commissioner_note,
    });
  }

  markComplaintFake(id: string) {
    return this.http.put(`${this.commissionerBase}/inspector-compliance/${id}/mark-fake`, {});
  }

  getAllFines() {
    return this.http.get<any[]>(`${this.commissionerBase}/fines`, {
      params: this.withPagination(),
    });
  }

  getFineById(id: string) {
    return this.http.get<any>(`${this.commissionerBase}/fines/${id}`);
  }

  updateFine(id: string, payload: Record<string, unknown> | FormData) {
    return this.http.put<any>(`${this.commissionerBase}/fines/${id}`, payload);
  }

  forgiveFine(id: string) {
    return this.http.delete(`${this.commissionerBase}/fines/${id}`);
  }
}
