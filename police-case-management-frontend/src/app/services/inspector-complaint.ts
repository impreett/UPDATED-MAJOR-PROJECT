import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE } from './config';

@Injectable({ providedIn: 'root' })
export class InspectorComplaintService {
  private readonly defaultListLimit = 60;

  constructor(private http: HttpClient) {}

  private withPagination(params?: Record<string, string | number | undefined>) {
    return {
      page: 1,
      limit: this.defaultListLimit,
      ...(params || {}),
    };
  }

  getInspectors() {
    return this.http.get<any[]>(`${API_BASE}/complaints/inspectors`, {
      params: this.withPagination({ limit: 200 }),
    });
  }

  submitComplaint(payload: FormData) {
    return this.http.post(`${API_BASE}/complaints/report-inspector`, payload);
  }

  getMyComplaints() {
    return this.http.get<any[]>(`${API_BASE}/complaints/my`, {
      params: this.withPagination(),
    });
  }

  getComplaintById(id: string) {
    return this.http.get<any>(`${API_BASE}/complaints/${id}`);
  }

  updateComplaintEvidence(id: string, payload: FormData) {
    return this.http.put(`${API_BASE}/complaints/${id}/evidence`, payload);
  }

  withdrawComplaint(id: string) {
    return this.http.delete(`${API_BASE}/complaints/${id}`);
  }
}
