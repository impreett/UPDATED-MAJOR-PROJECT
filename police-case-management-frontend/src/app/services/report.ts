import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE } from './config';

@Injectable({
  providedIn: 'root',
})
export class ReportService {
  private readonly defaultListLimit = 60;

  constructor(private http: HttpClient) {}

  private withPagination(params?: Record<string, string | number | undefined>) {
    return {
      page: 1,
      limit: this.defaultListLimit,
      ...(params || {}),
    };
  }

  submitPublicReport(payload: { email: string; reportText: string }) {
    return this.http.post(`${API_BASE}/reports/public`, payload);
  }

  submitReport(payload: { email: string; reportText: string }) {
    return this.http.post(`${API_BASE}/reports`, payload);
  }

  getReports() {
    return this.http.get<any[]>(`${API_BASE}/reports`, {
      params: this.withPagination(),
    });
  }

  deleteReport(id: string) {
    return this.http.delete(`${API_BASE}/reports/${id}`);
  }
}
