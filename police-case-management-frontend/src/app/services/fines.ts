import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE } from './config';

@Injectable({ providedIn: 'root' })
export class FineService {
  constructor(private http: HttpClient) {}

  issueFine(payload: Record<string, unknown> | FormData) {
    return this.http.post(`${API_BASE}/fines`, payload);
  }

  getMyFines() {
    return this.http.get<any[]>(`${API_BASE}/fines/my`);
  }

  createRazorpayOrder(id: string) {
    return this.http.post(`${API_BASE}/fines/${id}/razorpay-order`, {});
  }

  verifyRazorpayPayment(id: string, payload: Record<string, unknown>) {
    return this.http.post(`${API_BASE}/fines/${id}/razorpay-verify`, payload);
  }

  payFine(id: string) {
    return this.http.post(`${API_BASE}/fines/${id}/pay`, {});
  }
}
