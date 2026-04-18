import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminService } from '../../services/admin';
import { AppFeedbackService } from '../../services/app-feedback.service';
import { CaseService } from '../../services/case';
import { toAbsoluteAssetUrl } from '../../utils/asset-url';
import {
  buildExistingEvidencePayload,
  buildNewEvidenceUploadPayload,
  createEmptyEvidenceEntry,
  formatFileSize,
  MAX_EVIDENCE_FILE_SIZE_MB,
  parseEvidenceEntries,
  EvidenceEditorEntry,
  EvidenceFieldErrors,
  validateEvidenceEntries,
} from '../../utils/evidence-editor';

type AdminUpdateFormErrors = {
  case_title?: string;
  case_type?: string;
  case_description?: string;
  changes_done?: string;
  involvedPeople?: string;
  case_date?: string;
  status?: string;
  case_handler?: string;
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
  selector: 'app-admin-update-form',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './admin-update-form.html',
  styleUrl: './admin-update-form.css',
})
export class AdminUpdateForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  adminUpdateCaseForm = this.fb.nonNullable.group({
    case_title: '',
    case_type: '',
    case_description: '',
    changes_done: this.fb.nonNullable.array([this.fb.nonNullable.control('')]),
    case_date: '',
    status: '',
    case_handler: '',
  });
  involvedPeople: InvolvedPerson[] = [];
  evidenceEntries: EvidenceEditorEntry[] = [createEmptyEvidenceEntry()];
  evidenceErrors: EvidenceFieldErrors[] = [];
  officers: string[] = [];
  loading = true;
  errors: AdminUpdateFormErrors = {};
  todayStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
  id = '';
  isSubmitting = false;
  readonly maxEvidenceFileSizeMb = MAX_EVIDENCE_FILE_SIZE_MB;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private adminService: AdminService,
    private caseService: CaseService,
    private feedback: AppFeedbackService
  ) {}

  async ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id') || '';
    try {
      const caseRes = await firstValueFrom(this.caseService.getCaseById(this.id));
      const formattedDate = new Date(caseRes.case_date).toISOString().split('T')[0];
      this.adminUpdateCaseForm.patchValue({
        case_title: caseRes?.case_title || '',
        case_type: caseRes?.case_type || '',
        case_description: caseRes?.case_description || '',
        case_date: formattedDate || '',
        status: caseRes?.status || '',
        case_handler: caseRes?.case_handler || '',
      });
      const existingChangesDone = this.normalizeChangesDone(caseRes?.changes_done);
      const changesDoneArray = this.adminUpdateCaseForm.controls.changes_done;
      changesDoneArray.clear();
      if (existingChangesDone.length) {
        for (const change of existingChangesDone) {
          changesDoneArray.push(this.fb.nonNullable.control(change));
        }
      } else {
        changesDoneArray.push(this.fb.nonNullable.control(''));
      }
      this.involvedPeople = [
        ...this.parsePeopleField(caseRes?.suspects, 'suspects'),
        ...this.parsePeopleField(caseRes?.guilty_name, 'guilty_name'),
        ...this.parsePeopleField(caseRes?.victim, 'victim'),
      ];
      this.evidenceEntries = parseEvidenceEntries(caseRes?.evidence);
      if (!this.evidenceEntries.length) {
        this.evidenceEntries = [createEmptyEvidenceEntry()];
      }

      const officersRes = await firstValueFrom(this.adminService.getActiveUsers());
      const names = (officersRes || []).map((o: any) => o.fullname || o);
      const currentHandler = caseRes.case_handler;
      if (currentHandler && !names.includes(currentHandler)) {
        names.unshift(currentHandler);
      }
      this.officers = names;
    } catch (err) {
      console.error(err);
      this.feedback.showError('Failed to load data. You may not be authorized.');
    } finally {
      this.loading = false;
    }
  }

  private normalizeText(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  private normalizeChangesDone(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeText(item)).filter(Boolean);
    }
    const text = this.normalizeText(value);
    return text ? [text] : [];
  }

  private parsePeopleField(value: unknown, role: Exclude<PersonRole, ''>): InvolvedPerson[] {
    if (Array.isArray(value)) {
      return value
        .map((entry: any) => {
          if (!entry || typeof entry !== 'object') return null;
          const name = this.normalizeText(entry.name);
          if (!name) return null;
          const ageText =
            entry.age === null || entry.age === undefined || entry.age === ''
              ? ''
              : String(entry.age).trim();
          const normalizedAge =
            /^\d{1,3}$/.test(ageText) && Number(ageText) <= 120 ? ageText : '';
          return { name, age: normalizedAge, role };
        })
        .filter((entry) => !!entry) as InvolvedPerson[];
    }

    const text = this.normalizeText(value);
    if (!text || text.toUpperCase() === 'N/A') return [];

    return text
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const withAge = part.match(/^Name:\s*(.+?)\s+Age:\s*([^,]+)$/i);
        if (withAge) {
          const parsedAgeRaw = this.normalizeText(withAge[2]);
          const parsedAge =
            /^\d{1,3}$/.test(parsedAgeRaw) && Number(parsedAgeRaw) <= 120 ? parsedAgeRaw : '';
          return {
            name: this.normalizeText(withAge[1]),
            age: parsedAge,
            role,
          };
        }

        const nameOnly = part.match(/^Name:\s*(.+)$/i);
        const name = nameOnly ? this.normalizeText(nameOnly[1]) : this.normalizeText(part);
        if (!name) return null;

        return {
          name,
          age: '',
          role,
        };
      })
      .filter((entry) => !!entry) as InvolvedPerson[];
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

  get changesDoneControls() {
    return this.adminUpdateCaseForm.controls.changes_done.controls;
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

  addChangeDone() {
    this.adminUpdateCaseForm.controls.changes_done.push(this.fb.nonNullable.control(''));
  }

  removeChangeDone(index: number) {
    if (this.adminUpdateCaseForm.controls.changes_done.length <= 1) return;
    this.adminUpdateCaseForm.controls.changes_done.removeAt(index);
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
      const ageText = this.normalizeText(person.age);
      const role = person.role;
      if (!name || !role) continue;
      grouped[role].push({
        name,
        age: ageText ? Number(ageText) : null,
      });
    }

    return {
      suspects: grouped.suspects,
      victim: grouped.victim,
      guilty_name: grouped.guilty_name,
    };
  }

  validate() {
    const formData = this.adminUpdateCaseForm.getRawValue();
    const errs: AdminUpdateFormErrors = {};
    const nameRegex = /^[A-Za-z ]+$/;
    const changesDone = (formData.changes_done || []).map((item) => this.normalizeText(item));

    if (!formData.case_title || (formData.case_title || '').length < 5) {
      errs.case_title = !formData.case_title
        ? 'Please enter the case title.'
        : 'Case title must be at least 5 characters.';
    }
    if (!formData.case_type) {
      errs.case_type = 'Please select a case type.';
    }
    if (!formData.case_description || (formData.case_description || '').length < 20) {
      errs.case_description = !formData.case_description
        ? 'Please provide a description.'
        : 'Description must be at least 20 characters.';
    }
    if (!changesDone.length || changesDone.some((item) => !item)) {
      errs.changes_done = 'Add at least one change, and do not leave any change entry blank.';
    }
    if (this.involvedPeople.length > 0) {
      for (const person of this.involvedPeople) {
        const name = this.normalizeText(person.name);
        const ageText = this.normalizeText(person.age);
        const letters = name.replace(/\s/g, '').length;
        if (!name || letters < 3 || letters > 20 || !nameRegex.test(name)) {
          errs.involvedPeople = 'Each name must be 3-20 letters (alphabets and spaces only).';
          break;
        }
        if (ageText && (!/^\d{1,3}$/.test(ageText) || Number(ageText) > 120)) {
          errs.involvedPeople = 'Each age must be between 0 and 120.';
          break;
        }
      }
    }
    if (!formData.case_date) {
      errs.case_date = 'Please select a case date.';
    } else if (formData.case_date > this.todayStr) {
      errs.case_date = 'Case date cannot be in the future.';
    }
    if (!formData.status) {
      errs.status = 'Please select a case status.';
    }
    if (!formData.case_handler) {
      errs.case_handler = 'Please select a case handler.';
    }

    const evidenceValidation = validateEvidenceEntries(this.evidenceEntries);
    this.evidenceErrors = evidenceValidation.errors;
    if (evidenceValidation.hasErrors) {
      errs.evidence = 'Fix evidence field errors below.';
    }

    this.errors = errs;
    return Object.keys(errs).length === 0;
  }

  async onSubmit() {
    try {
      if (this.isSubmitting) return;
      if (!this.validate()) return;
      this.isSubmitting = true;
      const cleanFormData = this.adminUpdateCaseForm.getRawValue();
      const changes_done = (cleanFormData.changes_done || [])
        .map((item) => this.normalizeText(item))
        .filter(Boolean);
      const peoplePayload = this.buildPeoplePayload();
      const payload = new FormData();
      payload.append('case_title', cleanFormData.case_title);
      payload.append('case_type', cleanFormData.case_type);
      payload.append('case_description', cleanFormData.case_description);
      payload.append('case_date', cleanFormData.case_date);
      payload.append('status', cleanFormData.status);
      payload.append('case_handler', cleanFormData.case_handler);
      payload.append('suspects_json', JSON.stringify(peoplePayload.suspects));
      payload.append('victim_json', JSON.stringify(peoplePayload.victim));
      payload.append('guilty_name_json', JSON.stringify(peoplePayload.guilty_name));
      payload.append('changes_done_json', JSON.stringify(changes_done));
      payload.append(
        'existing_evidence_json',
        JSON.stringify(buildExistingEvidencePayload(this.evidenceEntries))
      );
      for (const evidence of buildNewEvidenceUploadPayload(this.evidenceEntries)) {
        payload.append('evidence_names', evidence.evidence_name);
        payload.append('evidence_files', evidence.evidence_file);
      }
      await firstValueFrom(this.caseService.updateCase(this.id, payload));
      this.feedback.showMessage('Case updated successfully!', 'success');
      this.router.navigate(['/commissioner/update-case']);
    } catch {
      this.feedback.showError('Error updating case.');
    } finally {
      this.isSubmitting = false;
    }
  }
}
