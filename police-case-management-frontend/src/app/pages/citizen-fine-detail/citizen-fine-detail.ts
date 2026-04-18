import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AppStatePanel } from '../../components/app-state-panel/app-state-panel';
import { AppFeedbackService } from '../../services/app-feedback.service';
import { FineService } from '../../services/fines';
import { toAbsoluteAssetUrl } from '../../utils/asset-url';

type EvidenceDisplay = {
  name: string;
  url: string;
  fileType: string;
};

@Component({
  selector: 'app-citizen-fine-detail',
  imports: [CommonModule, RouterLink, AppStatePanel],
  templateUrl: './citizen-fine-detail.html',
  styleUrl: './citizen-fine-detail.css',
})
export class CitizenFineDetail implements OnInit {
  fine: any | null = null;
  evidenceDisplay: EvidenceDisplay[] = [];
  loading = true;
  errorMessage = '';
  paying = false;
  private razorpayReady?: Promise<boolean>;

  constructor(
    private route: ActivatedRoute,
    private fineService: FineService,
    private feedback: AppFeedbackService
  ) {}

  async ngOnInit() {
    await this.fetchFine();
  }

  get fineId(): string {
    return String(this.route.snapshot.paramMap.get('fineId') || '');
  }

  async fetchFine() {
    this.loading = true;
    this.errorMessage = '';
    const id = this.fineId;
    if (!id) {
      this.errorMessage = 'Fine not found.';
      this.loading = false;
      return;
    }

    try {
      const fines = (await firstValueFrom(this.fineService.getMyFines())) || [];
      const fine = fines.find((entry) => String(entry?._id) === id) || null;
      this.setFine(fine);
      if (!this.fine) {
        this.errorMessage = 'Fine not found.';
      }
    } catch (err: any) {
      const message = err?.error?.msg || 'Failed to load fine details.';
      this.errorMessage = message;
      this.feedback.showError(message);
    } finally {
      this.loading = false;
    }
  }

  statusLabel(fine: any) {
    const status = this.normalizeText(fine?.status).toUpperCase();
    return status === 'PAID' ? 'Paid' : 'Unpaid';
  }

  formatAadhar(value: unknown): string {
    const raw = this.normalizeText(value);
    if (!raw) return 'N/A';
    const digits = raw.replace(/\D/g, '');
    if (!digits) return raw;
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
  }

  private setFine(fine: any) {
    this.fine = fine || null;
    this.evidenceDisplay = this.parseEvidence(this.fine?.evidence);
  }

  canPay(fine: any) {
    return this.normalizeText(fine?.status).toUpperCase() !== 'PAID';
  }

  private parseEvidence(value: unknown): EvidenceDisplay[] {
    if (!Array.isArray(value)) return [];

    const evidence: EvidenceDisplay[] = [];
    for (let i = 0; i < value.length; i++) {
      const entry: any = value[i];
      if (!entry || typeof entry !== 'object') continue;

      const rawUrl = entry.evidence_file_url ?? entry.url ?? entry.file_url;
      const url = toAbsoluteAssetUrl(rawUrl);
      if (!url) continue;

      const name = this.normalizeText(entry.evidence_name) || `Evidence ${i + 1}`;
      const fileType = this.normalizeText(entry.evidence_file_type || entry.fileType || entry.mimetype).toLowerCase();
      evidence.push({ name, url, fileType });
    }

    return evidence;
  }

  isImageEvidence(evidence: EvidenceDisplay): boolean {
    return String(evidence?.fileType || '').toLowerCase().startsWith('image/');
  }

  isVideoEvidence(evidence: EvidenceDisplay): boolean {
    return String(evidence?.fileType || '').toLowerCase().startsWith('video/');
  }

  private loadRazorpay(): Promise<boolean> {
    if (this.razorpayReady) return this.razorpayReady;
    this.razorpayReady = new Promise<boolean>((resolve) => {
      if (typeof window === 'undefined') {
        resolve(false);
        return;
      }
      const existing = (window as any).Razorpay;
      if (existing) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
    return this.razorpayReady;
  }

  async payFine() {
    if (!this.fine?._id || this.paying) return;
    const confirmed = await this.feedback.confirm({
      title: 'Pay fine',
      message: `Pay ₹${this.fine.amount || 0}?`,
      confirmLabel: 'Pay',
      cancelLabel: 'Cancel',
      confirmTone: 'approve',
      cancelTone: 'check',
    });
    if (!confirmed) return;

    this.paying = true;
    try {
      const sdkReady = await this.loadRazorpay();
      if (!sdkReady || typeof window === 'undefined' || !(window as any).Razorpay) {
        throw new Error('Payment gateway failed to load.');
      }

      const order: any = await firstValueFrom(this.fineService.createRazorpayOrder(this.fine._id));
      if (!order?.orderId || !order?.keyId) {
        throw new Error('Payment order could not be created.');
      }

      const options = {
        key: order.keyId,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: 'Police Case Management',
        description: `Fine payment`,
        order_id: order.orderId,
        prefill: {
          name: this.fine.person_name || '',
          email: this.fine.email || '',
          contact: this.fine.mobile_number || '',
        },
        notes: {
          fine_id: String(this.fine._id),
        },
        handler: async (response: any) => {
          try {
            await firstValueFrom(this.fineService.verifyRazorpayPayment(this.fine._id, response || {}));
            this.feedback.showMessage('Fine paid successfully.', 'success');
            await this.fetchFine();
          } catch (err: any) {
            this.feedback.showError(err?.error?.msg || 'Payment verification failed.');
          } finally {
            this.paying = false;
          }
        },
        modal: {
          ondismiss: () => {
            this.paying = false;
          },
        },
      };

      const razorpay = new (window as any).Razorpay(options);
      razorpay.on('payment.failed', (response: any) => {
        this.feedback.showError(response?.error?.description || 'Payment failed.');
        this.paying = false;
      });
      razorpay.open();
    } catch (err: any) {
      this.paying = false;
      this.feedback.showError(err?.error?.msg || err?.message || 'Failed to start payment.');
    }
  }

  private normalizeText(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }
}
