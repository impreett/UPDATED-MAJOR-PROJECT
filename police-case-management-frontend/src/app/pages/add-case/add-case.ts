import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth';
import { AppFeedbackService } from '../../services/app-feedback.service';
import { CaseService } from '../../services/case';
import { toAbsoluteAssetUrl } from '../../utils/asset-url';
import {
  buildExistingEvidencePayload,
  buildNewEvidenceUploadPayload,
  createEmptyEvidenceEntry,
  parseEvidenceEntries,
  formatFileSize,
  MAX_EVIDENCE_FILE_SIZE_MB,
  EvidenceEditorEntry,
  EvidenceFieldErrors,
  validateEvidenceEntries,
} from '../../utils/evidence-editor';

type AddCaseErrors = {
  case_title?: string;
  case_type?: string;
  case_description?: string;
  involvedPeople?: string;
  case_date?: string;
  case_handler?: string;
  status?: string;
  evidence?: string;
};

type PersonRole = 'suspects' | 'victim' | 'guilty_name' | '';

type InvolvedPerson = {
  name: string;
  age: string | number;
  role: PersonRole;
};

type RoleListItem = {
  index: number;
  name: string;
  age: string;
};

@Component({
  selector: 'app-add-case',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './add-case.html',
  styleUrl: './add-case.css',
})
export class AddCase implements OnInit, OnDestroy {
  user: any = null;
  officers: string[] = [];
  private readonly fb = inject(FormBuilder);
  addCaseForm = this.fb.nonNullable.group({
    case_title: '',
    case_type: '',
    case_description: '',
    case_date: '',
    status: 'ACTIVE',
    case_handler: '',
  });
  involvedPeople: InvolvedPerson[] = [];
  evidenceEntries: EvidenceEditorEntry[] = [createEmptyEvidenceEntry()];
  evidenceErrors: EvidenceFieldErrors[] = [];
  errors: AddCaseErrors = {};
  successMessage = '';
  private successMessageTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly successMessageDurationMs = 7000;
  isSubmitting = false;
  readonly maxEvidenceFileSizeMb = MAX_EVIDENCE_FILE_SIZE_MB;
  todayStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
  citizenSourceId: string | null = null;

  constructor(
    private auth: AuthService,
    private caseService: CaseService,
    private feedback: AppFeedbackService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  private normalizeText(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  private toDateInput(value: unknown): string {
    if (!value) return '';
    const date = new Date(value as string);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
  }

  private peopleFromList(list: Array<{ name?: string; age?: number | null }> | null | undefined, role: PersonRole) {
    if (!Array.isArray(list) || !role) return;
    for (const person of list) {
      const name = this.normalizeText(person?.name);
      if (!name) continue;
      const age = person?.age === null || person?.age === undefined ? '' : String(person.age);
      this.involvedPeople.push({ name, age, role });
    }
  }

  private buildCitizenPrefillDescription(citizenName: string, description: string) {
    const baseDescription = this.normalizeText(description);
    if (!citizenName) return baseDescription;
    const prefix = `Submitted by ${citizenName} citizen.`;
    if (baseDescription.toLowerCase().includes(prefix.toLowerCase())) {
      return baseDescription;
    }
    return baseDescription ? `${prefix}\n\n${baseDescription}` : prefix;
  }

  private getDefaultFormValues() {
    return {
      case_title: '',
      case_type: '',
      case_description: '',
      case_date: '',
      status: 'ACTIVE',
      case_handler: this.user?.isAdmin ? '' : this.user?.fullname || '',
    };
  }

  private resetFormState() {
    this.addCaseForm.reset(this.getDefaultFormValues());
    this.involvedPeople = [];
    this.evidenceEntries = [createEmptyEvidenceEntry()];
    this.evidenceErrors = [];
    this.errors = {};
  }

  private async prefillFromCitizenCase(caseId: string) {
    try {
      const caseItem = await firstValueFrom(this.caseService.getCaseById(caseId));
      if (!caseItem) return;

      const citizenName = this.normalizeText(caseItem?.submitted_by_name);
      const prefillTitle =
        citizenName ? `Citizen Submission - ${citizenName}` : this.normalizeText(caseItem?.case_title);
      const prefillDescription = this.buildCitizenPrefillDescription(
        citizenName,
        this.normalizeText(caseItem?.case_description)
      );

      this.addCaseForm.patchValue({
        case_title: prefillTitle || this.normalizeText(caseItem?.case_title),
        case_type: this.normalizeText(caseItem?.case_type),
        case_description: prefillDescription,
        case_date: this.toDateInput(caseItem?.case_date),
      });

      this.involvedPeople = [];
      this.peopleFromList(caseItem?.suspects_list, 'suspects');
      this.peopleFromList(caseItem?.victim_list, 'victim');
      this.peopleFromList(caseItem?.guilty_name_list, 'guilty_name');

      const parsedEvidence = parseEvidenceEntries(caseItem?.evidence || []);
      this.evidenceEntries = parsedEvidence.length ? parsedEvidence : [createEmptyEvidenceEntry()];
      this.evidenceErrors = [];
    } catch (err) {
      console.error('Failed to prefill citizen case:', err);
      this.feedback.showError('Failed to load citizen submission details.');
    }
  }

  async ngOnInit() {
    this.user = this.auth.getUser();
    if (this.user?.isAdmin) {
      try {
        const res = await firstValueFrom(this.caseService.getOfficers());
        this.officers = (res || []).map((o: any) => o.fullname || o);
      } catch {
        console.error('Failed to fetch officers');
      }
    } else if (this.user) {
      this.addCaseForm.patchValue({ case_handler: this.user.fullname || '' });
    }

    const citizenCaseId = this.route.snapshot.queryParamMap.get('citizenCaseId');
    if (citizenCaseId) {
      this.citizenSourceId = citizenCaseId;
      await this.prefillFromCitizenCase(citizenCaseId);
    }
  }

  ngOnDestroy() {
    this.clearSuccessMessageTimer();
  }

  closeSuccessMessage() {
    this.clearSuccessMessageTimer();
    this.successMessage = '';
  }

  async cancelForm() {
    this.clearSuccessMessageTimer();
    this.successMessage = '';
    this.errors = {};

    if (this.citizenSourceId) {
      await this.prefillFromCitizenCase(this.citizenSourceId);
      this.addCaseForm.patchValue({
        status: 'ACTIVE',
        case_handler: this.user?.isAdmin ? '' : this.user?.fullname || '',
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    this.resetFormState();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  goBack() {
    if (this.citizenSourceId) {
      this.router.navigate(['/inspector/citizen-submissions']);
      return;
    }

    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
      return;
    }

    const fallbackRoute = this.user?.isAdmin ? '/commissioner/home' : '/inspector/home';
    this.router.navigate([fallbackRoute]);
  }

  addPersonForRole(role: Exclude<PersonRole, ''>) {
    this.involvedPeople.push({
      name: '',
      age: '',
      role,
    });
  }

  private getPeopleByRole(role: Exclude<PersonRole, ''>): RoleListItem[] {
    return this.involvedPeople
      .map((person, index) => ({ person, index }))
      .filter((entry) => entry.person.role === role)
      .map((entry) => ({
        index: entry.index,
        name: this.normalizeText(entry.person.name),
        age: this.normalizeText(entry.person.age),
      }));
  }

  get suspectPeople() {
    return this.getPeopleByRole('suspects');
  }

  get guiltyPeople() {
    return this.getPeopleByRole('guilty_name');
  }

  get victimPeople() {
    return this.getPeopleByRole('victim');
  }

  removePerson(index: number) {
    this.involvedPeople.splice(index, 1);
  }

  trackByIndex(_index: number, item: RoleListItem) {
    return item.index;
  }

  trackByEvidenceIndex(index: number) {
    return index;
  }

  onPersonNameChange(index: number, value: string) {
    if (!this.involvedPeople[index]) return;
    this.involvedPeople[index].name = value;
  }

  onPersonAgeChange(index: number, value: string) {
    if (!this.involvedPeople[index]) return;
    const trimmed = this.normalizeText(value);
    if (!trimmed) {
      this.involvedPeople[index].age = '';
      return;
    }
    if (!/^\d{0,3}$/.test(trimmed)) {
      return;
    }
    const numeric = Number(trimmed);
    this.involvedPeople[index].age = numeric > 120 ? '120' : trimmed;
  }

  private buildPeoplePayload() {
    const grouped: {
      suspects: Array<{ name: string; age: number | null }>;
      victim: Array<{ name: string; age: number | null }>;
      guilty_name: Array<{ name: string; age: number | null }>;
    } = {
      suspects: [],
      victim: [],
      guilty_name: [],
    };

    for (const person of this.involvedPeople) {
      const name = this.normalizeText(person.name);
      const age = this.normalizeText(person.age);
      const role = person.role;
      if (!name || !role) continue;
      grouped[role].push({ name, age: age ? Number(age) : null });
    }

    return {
      suspects: grouped.suspects,
      victim: grouped.victim,
      guilty_name: grouped.guilty_name,
    };
  }

  addEvidence() {
    this.evidenceEntries.push(createEmptyEvidenceEntry());
  }

  removeEvidence(index: number) {
    if (this.evidenceEntries.length <= 1) {
      this.evidenceEntries = [createEmptyEvidenceEntry()];
      this.evidenceErrors = [];
      return;
    }
    this.evidenceEntries.splice(index, 1);
    this.evidenceErrors.splice(index, 1);
  }

  onEvidenceNameChange(index: number, value: string) {
    if (!this.evidenceEntries[index]) return;
    this.evidenceEntries[index].evidence_name = value;
  }

  onEvidenceFileChange(index: number, event: Event) {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] || null;
    if (!this.evidenceEntries[index]) return;
    this.evidenceEntries[index].evidence_file = file;
  }

  clearEvidenceFile(index: number, input?: HTMLInputElement | null) {
    if (!this.evidenceEntries[index]) return;
    this.evidenceEntries[index].evidence_file = null;
    if (input) {
      input.value = '';
    }
  }

  getEvidenceError(index: number, field: keyof EvidenceFieldErrors) {
    return this.evidenceErrors[index]?.[field] || '';
  }

  evidenceLink(entry: EvidenceEditorEntry): string {
    return toAbsoluteAssetUrl(entry.existing_file_url);
  }

  evidenceFileLabel(entry: EvidenceEditorEntry): string {
    if (!entry?.evidence_file) return '';
    return `${entry.evidence_file.name} (${formatFileSize(entry.evidence_file.size)})`;
  }

  validate() {
    const formData = this.addCaseForm.getRawValue();
    const tempErrors: AddCaseErrors = {};
    const nameRegex = /^[A-Za-z ]+$/;

    if (!formData.case_title || formData.case_title.length < 5) {
      tempErrors.case_title = 'Title must be at least 5 characters.';
    }
    if (!formData.case_type) {
      tempErrors.case_type = 'Please select a case type.';
    }
    if (!formData.case_description || formData.case_description.length < 20) {
      tempErrors.case_description = 'Description must be at least 20 characters.';
    }
    const caseDateValue = String(formData.case_date || '');
    if (!caseDateValue) {
      tempErrors.case_date = 'Case date is required.';
    } else if (caseDateValue > this.todayStr) {
      tempErrors.case_date = 'Case date cannot be in the future.';
    }
    if (this.user?.isAdmin && !formData.case_handler) {
      tempErrors.case_handler = 'Please select a case handler.';
    }

    if (this.involvedPeople.length > 0) {
      for (const person of this.involvedPeople) {
        const name = this.normalizeText(person.name);
        const ageText = this.normalizeText(person.age);
        const role = person.role;
        const letters = name.replace(/\s/g, '').length;

        if (!role || !name || letters < 3 || letters > 20 || !nameRegex.test(name)) {
          tempErrors.involvedPeople = 'Each name must be 3-20 letters (alphabets and spaces only).';
          break;
        }

        if (ageText && (!/^\d{1,3}$/.test(ageText) || Number(ageText) > 120)) {
          tempErrors.involvedPeople = 'Each age must be between 0 and 120.';
          break;
        }
      }
    }

    const evidenceValidation = validateEvidenceEntries(this.evidenceEntries);
    this.evidenceErrors = evidenceValidation.errors;
    if (evidenceValidation.hasErrors) {
      tempErrors.evidence = 'Fix evidence field errors below.';
    }

    this.errors = tempErrors;
    return Object.values(tempErrors).every((x) => !x);
  }

  async onSubmit() {
    if (this.isSubmitting) return;
    if (!this.validate()) return;
    this.isSubmitting = true;
    try {
      const formData = this.addCaseForm.getRawValue();
      const peoplePayload = this.buildPeoplePayload();
      const payload = new FormData();
      payload.append('case_title', formData.case_title);
      payload.append('case_type', formData.case_type);
      payload.append('case_description', formData.case_description);
      payload.append('case_date', formData.case_date);
      payload.append('status', formData.status);
      payload.append('case_handler', formData.case_handler);
      payload.append('suspects_json', JSON.stringify(peoplePayload.suspects));
      payload.append('victim_json', JSON.stringify(peoplePayload.victim));
      payload.append('guilty_name_json', JSON.stringify(peoplePayload.guilty_name));
      payload.append(
        'existing_evidence_json',
        JSON.stringify(buildExistingEvidencePayload(this.evidenceEntries))
      );
      for (const evidence of buildNewEvidenceUploadPayload(this.evidenceEntries)) {
        payload.append('evidence_names', evidence.evidence_name);
        payload.append('evidence_files', evidence.evidence_file);
      }

      if (this.citizenSourceId) {
        await firstValueFrom(this.caseService.acceptCitizenSubmission(this.citizenSourceId, payload));
        this.showSuccessMessage('Your case will be reviewed by the commissioner, and we will approve your case soon.');
        this.router.navigate(['/inspector/citizen-submissions']);
        return;
      }

      await firstValueFrom(this.caseService.addCase(payload));
      this.showSuccessMessage('Your case will be reviewed by the commissioner, and we will approve your case soon.');
      this.resetFormState();
      window.scrollTo(0, 0);
    } catch (err: any) {
      console.error('Error details:', err?.error || err);
      this.successMessage = '';
      this.feedback.showError('Error adding case: ' + (err?.error?.msg || err?.message || err));
    } finally {
      this.isSubmitting = false;
    }
  }

  private showSuccessMessage(message: string) {
    this.clearSuccessMessageTimer();
    this.successMessage = message;
    this.successMessageTimer = setTimeout(() => {
      this.successMessage = '';
      this.successMessageTimer = null;
    }, this.successMessageDurationMs);
  }

  private clearSuccessMessageTimer() {
    if (this.successMessageTimer) {
      clearTimeout(this.successMessageTimer);
      this.successMessageTimer = null;
    }
  }
}
