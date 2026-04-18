import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE } from './config';

@Injectable({ providedIn: 'root' })
export class CaseTransferService {
  constructor(private http: HttpClient) {}

  requestTransfer(caseId: string, reason: string) {
    return this.http.post(`${API_BASE}/case-transfer`, {
      case_id: caseId,
      reason,
    });
  }

  getMyRequests() {
    return this.http.get<any[]>(`${API_BASE}/case-transfer/my`);
  }

  getAllRequests() {
    return this.http.get<any[]>(`${API_BASE}/case-transfer`);
  }

  assignTransfer(requestId: string, toInspectorId: string) {
    return this.http.post(`${API_BASE}/case-transfer/${requestId}/assign`, {
      to_inspector_id: toInspectorId,
    });
  }

  rejectTransfer(requestId: string) {
    return this.http.post(`${API_BASE}/case-transfer/${requestId}/reject`, {});
  }
}
