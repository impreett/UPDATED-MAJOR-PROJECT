import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AppFeedbackService } from '../../services/app-feedback.service';
import { FineService } from '../../services/fines';
import { API_BASE } from '../../services/config';
@Component({
  selector: 'app-citizen-pay-fine',
  imports: [CommonModule, RouterLink],
  templateUrl: './citizen-pay-fine.html',
  styleUrl: './citizen-pay-fine.css',
})
export class CitizenPayFine implements OnInit, AfterViewInit {
  @ViewChild('filterTabs') filterTabs?: ElementRef<HTMLElement>;

  fines: any[] = [];
  loading = true;
  errorMessage = '';
  payingId = '';
  filterStatus: 'all' | 'paid' | 'unpaid' = 'all';
  sortOrder: 'latest' | 'oldest' = 'latest';
  pageSize = 30;
  currentPage = 1;
  private razorpayReady?: Promise<boolean>;
  private pdfFontData?: { regular: string; bold: string };

  constructor(private fineService: FineService, private feedback: AppFeedbackService) {}

  async ngOnInit() {
    await this.fetchFines();
  }

  ngAfterViewInit() {
    this.syncFilterTabMetrics();
    setTimeout(() => this.syncFilterTabMetrics());
    if (typeof document !== 'undefined' && 'fonts' in document) {
      (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready
        .then(() => this.syncFilterTabMetrics())
        .catch(() => {});
    }
  }

  private normalizeText(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  private formatAadhar(value: unknown): string {
    const raw = this.normalizeText(value);
    if (!raw) return '-';
    const digits = raw.replace(/\D/g, '');
    if (!digits) return raw;
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
  }

  async fetchFines() {
    this.loading = true;
    this.errorMessage = '';
    try {
      this.fines = (await firstValueFrom(this.fineService.getMyFines())) || [];
    } catch (err: any) {
      this.errorMessage = err?.error?.msg || 'Failed to fetch fines.';
      this.feedback.showError(this.errorMessage);
    } finally {
      this.loading = false;
      setTimeout(() => this.syncFilterTabMetrics());
    }
  }

  statusLabel(fine: any) {
    const status = this.normalizeText(fine?.status).toUpperCase();
    return status === 'PAID' ? 'Paid' : 'Unpaid';
  }

  canPay(fine: any) {
    return this.normalizeText(fine?.status).toUpperCase() !== 'PAID';
  }

  setFilter(status: 'all' | 'paid' | 'unpaid') {
    if (this.filterStatus === status) return;
    this.filterStatus = status;
    this.currentPage = 1;
    setTimeout(() => this.syncFilterTabMetrics());
  }

  setSort(order: 'latest' | 'oldest') {
    if (this.sortOrder === order) return;
    this.sortOrder = order;
    this.currentPage = 1;
  }

  @HostListener('window:resize')
  onWindowResize() {
    this.syncFilterTabMetrics();
  }

  private syncFilterTabMetrics() {
    const tabs = this.filterTabs?.nativeElement;
    if (!tabs) return;
    const labels = Array.from(tabs.querySelectorAll('label.tab')) as HTMLElement[];
    if (labels.length < 3) return;

    const setPxVar = (name: string, value: number) =>
      tabs.style.setProperty(name, `${Math.ceil(value)}px`);

    setPxVar('--filter-all-w', labels[0].offsetWidth);
    setPxVar('--filter-paid-w', labels[1].offsetWidth);
    setPxVar('--filter-unpaid-w', labels[2].offsetWidth);

    setPxVar('--filter-all-x', labels[0].offsetLeft);
    setPxVar('--filter-paid-x', labels[1].offsetLeft);
    setPxVar('--filter-unpaid-x', labels[2].offsetLeft);
  }

  private fineTimestamp(fine: any): number {
    const raw = fine?.createdAt || fine?.issued_at || fine?.paid_at || fine?.updatedAt;
    const time = new Date(raw || 0).getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  get filteredFines() {
    if (this.filterStatus === 'all') return this.fines;
    return this.fines.filter((fine) => {
      const isPaid = this.normalizeText(fine?.status).toUpperCase() === 'PAID';
      return this.filterStatus === 'paid' ? isPaid : !isPaid;
    });
  }

  get sortedFines() {
    const items = [...this.filteredFines];
    items.sort((a, b) => {
      const aTime = this.fineTimestamp(a);
      const bTime = this.fineTimestamp(b);
      return this.sortOrder === 'latest' ? bTime - aTime : aTime - bTime;
    });
    return items;
  }

  get pagedFines() {
    const size = Math.max(1, this.pageSize);
    const start = (this.currentPage - 1) * size;
    return this.sortedFines.slice(start, start + size);
  }

  get groupedFines() {
    const groups: Array<{ key: string; label: string; items: any[] }> = [];
    const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' });
    for (const fine of this.pagedFines) {
      const raw = fine?.createdAt || fine?.issued_at || fine?.paid_at;
      const date = new Date(raw || 0);
      const isValid = !Number.isNaN(date.getTime());
      const key = isValid ? `${date.getFullYear()}-${date.getMonth()}` : 'unknown';
      const label = isValid ? formatter.format(date) : 'Unknown date';
      const lastGroup = groups[groups.length - 1];
      if (!lastGroup || lastGroup.key !== key) {
        groups.push({ key, label, items: [fine] });
      } else {
        lastGroup.items.push(fine);
      }
    }
    return groups;
  }

  trackByFine(index: number, fine: any) {
    return fine?._id || index;
  }

  trackByGroup(index: number, group: { key: string }) {
    return group.key || index;
  }

  get totalFines() {
    return this.sortedFines.length;
  }

  get totalPages() {
    const size = Math.max(1, this.pageSize);
    return Math.max(1, Math.ceil(this.totalFines / size));
  }

  get pageSummary() {
    if (this.totalFines === 0) return 'Showing 0-0 of 0';
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.totalFines, start + this.pageSize - 1);
    return `Showing ${start}-${end} of ${this.totalFines}`;
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage -= 1;
      this.scrollToTop();
    }
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage += 1;
      this.scrollToTop();
    }
  }

  private formatDateTime(value: any): string {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    const pad = (num: number) => String(num).padStart(2, '0');
    return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(
      date.getHours()
    )}:${pad(date.getMinutes())}`;
  }

  async downloadFinePdf(fine: any) {
    if (!fine) return;
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF();
      await this.registerPdfFonts(doc);
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const left = 14;
      const right = pageWidth - 14;
      const borderInset = 8;

      doc.setDrawColor(210, 214, 220);
      doc.setLineWidth(0.6);
      doc.rect(
        borderInset,
        borderInset,
        pageWidth - borderInset * 2,
        pageHeight - borderInset * 2
      );

      const safeText = (value: any) => String(value ?? '-');
      const nowLabel = this.formatDateTime(new Date());
      const status = this.statusLabel(fine);
      const amount = `₹${fine.amount ?? 0}`;
      const issuedAt = this.formatDateTime(fine.createdAt);
      const paidAt = this.formatDateTime(fine.paid_at || fine.updatedAt);

      const addSectionTitle = (title: string, y: number) => {
        doc.setFillColor(245, 246, 248);
        doc.rect(left, y, right - left, 8, 'F');
        doc.setFont('Carlito', 'bold');
        doc.setFontSize(11);
        doc.text(title, left + 2, y + 5.5);
        return y + 12;
      };

      const addRow = (label: string, value: string, y: number) => {
        const labelX = left;
        doc.setFont('Carlito', 'bold');
        doc.setFontSize(10);
        const labelText = `${label}:`;
        doc.text(labelText, labelX, y);
        const labelWidth = doc.getTextWidth(labelText);
        const valueX = Math.max(left + 55, labelX + labelWidth + 4);
        const maxWidth = right - valueX;
        doc.setFont('Carlito', 'normal');
        const lines = doc.splitTextToSize(value || '-', maxWidth);
        doc.text(lines, valueX, y);
        return y + lines.length * 5.5 + 1;
      };

      doc.setFont('Carlito', 'bold');
      doc.setFontSize(16);
      doc.text('Fine Receipt', left, 18);
      doc.setFont('Carlito', 'normal');
      doc.setFontSize(10);
      doc.text('Police Case Management', left, 24);
      doc.text(`Generated: ${nowLabel}`, right, 24, { align: 'right' });

      doc.setDrawColor(210, 214, 220);
      doc.setLineWidth(0.3);
      doc.line(left, 28, right, 28);

      doc.setFillColor(231, 245, 239);
      doc.rect(left, 32, right - left, 10, 'F');
      doc.setFont('Carlito', 'bold');
      doc.setFontSize(12);
      doc.text(`Amount: ₹${fine.amount ?? 0}`, left + 2, 39);
      doc.setFont('Carlito', 'normal');
      doc.setFontSize(10);
      doc.text(`Status: ${status}`, right - 2, 39, { align: 'right' });

      let y = 50;
      y = addSectionTitle('Fine Details', y);
      y = addRow('Fine ID', safeText(fine._id), y);
      y = addRow('Reason', safeText(fine.reason), y);
      y = addRow('Issued', issuedAt, y);

      y += 2;
      y = addSectionTitle('Citizen Details', y);
      y = addRow('Name', safeText(fine.person_name), y);
      y = addRow('Age', safeText(fine.person_age), y);
      y = addRow('Aadhar card number', this.formatAadhar(fine.aadhar_number), y);
      y = addRow('Email', safeText(fine.email), y);
      y = addRow('Mobile', safeText(fine.mobile_number), y);

      y += 2;
      y = addSectionTitle('Payment Details', y);
      y = addRow('Status', status, y);
      y = addRow('Paid On', status === 'Paid' ? paidAt : '-', y);

      y += 4;
      y = addSectionTitle('Verification Codes', y);
      const codePayload = `Fine:${safeText(fine._id)}|Status:${status}|PaidOn:${
        status === 'Paid' ? paidAt : '-'
      }|Amount:${fine.amount ?? 0}`;
      const seed = this.hashTextToSeed(codePayload);

      doc.setFont('Carlito', 'bold');
      doc.setFontSize(10);
      doc.text('QR Code', left, y);
      doc.text('Barcode', left + 86, y);

      const qrTop = y + 4;
      const targetUrl = `${API_BASE}/fines/public/${fine._id}`;
      const qrData = encodeURIComponent(targetUrl);
      const barcodeData = encodeURIComponent(targetUrl);
      
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${qrData}`;
      const barcodeUrl = `https://bwipjs-api.metafloor.com/?bcid=code128&text=${barcodeData}&scale=3&includetext`;

      try {
        const [qrBase64, barcodeBase64] = await Promise.all([
          this.fetchImageAsBase64(qrUrl),
          this.fetchImageAsBase64(barcodeUrl)
        ]);
        doc.addImage(qrBase64, 'PNG', left, qrTop, 30, 30);
        doc.addImage(barcodeBase64, 'PNG', left + 86, qrTop, 60, 20);
      } catch (e) {
        // Fallback to pseudo shapes if offline or API failure
        this.drawPseudoQr(doc, left, qrTop, 30, seed);
        this.drawPseudoBarcode(doc, left + 86, qrTop, 60, 20, seed + 97);
      }

      doc.setFont('Carlito', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(90, 96, 102);
      
      doc.setTextColor(0, 0, 0);

      const filename = `fine-${fine._id || 'details'}.pdf`;
      doc.save(filename);
    } catch (err: any) {
      this.feedback.showError(err?.message || 'Failed to generate PDF.');
    }
  }

  private async registerPdfFonts(doc: any) {
    const fontData = await this.loadPdfFonts();
    doc.addFileToVFS('Carlito-Regular.ttf', fontData.regular);
    doc.addFont('Carlito-Regular.ttf', 'Carlito', 'normal');
    doc.addFileToVFS('Carlito-Bold.ttf', fontData.bold);
    doc.addFont('Carlito-Bold.ttf', 'Carlito', 'bold');
  }

  private async loadPdfFonts() {
    if (this.pdfFontData) return this.pdfFontData;
    const [regular, bold] = await Promise.all([
      this.fetchFontAsBase64('/assets/fonts/Carlito/Carlito-Regular.ttf'),
      this.fetchFontAsBase64('/assets/fonts/Carlito/Carlito-Bold.ttf'),
    ]);
    this.pdfFontData = { regular, bold };
    return this.pdfFontData;
  }

  private async fetchFontAsBase64(url: string) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Failed to load PDF font.');
    }
    const buffer = await response.arrayBuffer();
    return this.arrayBufferToBase64(buffer);
  }

  private async fetchImageAsBase64(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch image');
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private arrayBufferToBase64(buffer: ArrayBuffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  private hashTextToSeed(text: string) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  private createRng(seed: number) {
    let state = seed || 1;
    return () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return ((state >>> 0) % 1000) / 1000;
    };
  }

  private drawPseudoQr(doc: any, x: number, y: number, size: number, seed: number) {
    const modules = 21;
    const moduleSize = size / modules;
    const rng = this.createRng(seed);

    const isFinder = (row: number, col: number, fx: number, fy: number) => {
      if (row < fy || row > fy + 6 || col < fx || col > fx + 6) return false;
      const dx = col - fx;
      const dy = row - fy;
      const inOuter = dx === 0 || dx === 6 || dy === 0 || dy === 6;
      const inInner = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
      return inOuter || inInner;
    };

    doc.setFillColor(0, 0, 0);
    for (let row = 0; row < modules; row += 1) {
      for (let col = 0; col < modules; col += 1) {
        const inFinder =
          isFinder(row, col, 0, 0) ||
          isFinder(row, col, modules - 7, 0) ||
          isFinder(row, col, 0, modules - 7);
        const shouldFill = inFinder ? true : rng() > 0.5;
        if (!shouldFill) continue;
        doc.rect(x + col * moduleSize, y + row * moduleSize, moduleSize, moduleSize, 'F');
      }
    }
  }

  private drawPseudoBarcode(
    doc: any,
    x: number,
    y: number,
    width: number,
    height: number,
    seed: number
  ) {
    const rng = this.createRng(seed);
    let cursor = x;
    doc.setFillColor(0, 0, 0);
    while (cursor < x + width) {
      const drawBar = rng() > 0.4;
      const barWidth = rng() > 0.85 ? 1.6 : 0.8;
      if (drawBar) {
        doc.rect(cursor, y, barWidth, height, 'F');
      }
      cursor += barWidth + 0.4;
    }
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

  async payFine(fine: any) {
    if (!fine?._id || this.payingId) return;
    const confirmed = await this.feedback.confirm({
      title: 'Pay fine',
      message: `You are about to pay ₹${fine.amount || 0} for this fine. Please confirm to proceed with the payment.`,
      confirmLabel: 'Pay',
      cancelLabel: 'Cancel',
      confirmTone: 'approve',
      cancelTone: 'check',
    });
    if (!confirmed) return;

    this.payingId = fine._id;
    try {
      const sdkReady = await this.loadRazorpay();
      if (!sdkReady || typeof window === 'undefined' || !(window as any).Razorpay) {
        throw new Error('Payment gateway failed to load.');
      }

      const order: any = await firstValueFrom(this.fineService.createRazorpayOrder(fine._id));
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
          name: fine.person_name || '',
          email: fine.email || '',
          contact: fine.mobile_number || '',
        },
        notes: {
          fine_id: String(fine._id),
        },
        handler: async (response: any) => {
          try {
            await firstValueFrom(this.fineService.verifyRazorpayPayment(fine._id, response || {}));
            this.feedback.showMessage('Fine paid successfully.', 'success');
            await this.fetchFines();
          } catch (err: any) {
            this.feedback.showError(err?.error?.msg || 'Payment verification failed.');
          } finally {
            this.payingId = '';
          }
        },
        modal: {
          ondismiss: () => {
            this.payingId = '';
          },
        },
      };

      const razorpay = new (window as any).Razorpay(options);
      razorpay.on('payment.failed', (response: any) => {
        this.feedback.showError(response?.error?.description || 'Payment failed.');
        this.payingId = '';
      });
      razorpay.open();
    } catch (err: any) {
      this.payingId = '';
      this.feedback.showError(err?.error?.msg || err?.message || 'Failed to start payment.');
    }
  }

  private scrollToTop() {
    if (typeof window === 'undefined') return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

}
