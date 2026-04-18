import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AppFeedbackService } from '../../services/app-feedback.service';
import { CaseService } from '../../services/case';
import {
  formatFileSize,
  isAllowedEvidenceType,
  MAX_EVIDENCE_FILE_SIZE_BYTES,
  MAX_EVIDENCE_FILE_SIZE_MB,
} from '../../utils/evidence-editor';

type PersonRole = 'suspects' | 'victim' | '';

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

type EvidenceFieldErrors = {
  evidence_name?: string;
  evidence_file?: string;
};

type CitizenSubmitErrors = {
  case_type?: string;
  case_description?: string;
  case_date?: string;
  involvedPeople?: string;
  evidence?: string;
};

@Component({
  selector: 'app-citizen-submit-case',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './citizen-submit-case.html',
  styleUrl: './citizen-submit-case.css',
})
export class CitizenSubmitCase {
  private readonly fb = inject(FormBuilder);
  todayStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
  loading = false;
  submitted = false;
  involvedPeople: InvolvedPerson[] = [];
  errors: CitizenSubmitErrors = {};
  evidenceErrors: EvidenceFieldErrors[] = [];
  readonly maxEvidenceFileSizeMb = MAX_EVIDENCE_FILE_SIZE_MB;

  readonly caseTypeOptions = [
    'Homicide (Murder)',
    'Manslaughter',
    'Rape / Sexual Assault',
    'Kidnapping / Abduction',
    'Aggravated Assault',
    'Simple Assault / Battery',
    'Robbery',
    'Burglary / House Breaking',
    'Theft (Larceny)',
    'Motor Vehicle Theft',
    'Vandalism / Criminal Damage',
    'Extortion / Blackmail',
    'Cybercrime / Hacking',
    'Fraud / Cheating',
    'Forgery / Counterfeiting',
    'Embezzlement / Breach of Trust',
    'Money Laundering',
    'Drug Offense (NDPS)',
    'Smuggling / Contraband',
    'Illegal Weapons',
    'Illegal Gambling',
    'Public Order / Rioting',
    'Domestic Violence',
    'Missing Person Report',
    'Traffic Accident (Non-Fatal)',
  ] as const;

  form = this.fb.nonNullable.group({
    case_type: '',
    case_description: '',
    case_date: '',
    evidence: this.fb.array([this.createEvidenceGroup()]),
  });

  constructor(
    private caseService: CaseService,
    private feedback: AppFeedbackService
  ) {}

  get evidence() {
    return this.form.controls.evidence as FormArray;
  }

  private normalizeText(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  addPersonForRole(role: Exclude<PersonRole, ''>) {
    this.involvedPeople.push({
      name: '',
      age: '',
      role,
    });
    if (this.submitted) this.validate();
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

  get victimPeople() {
    return this.getPeopleByRole('victim');
  }

  removePerson(index: number) {
    this.involvedPeople.splice(index, 1);
    if (this.submitted) this.validate();
  }

  trackByIndex(_index: number, item: RoleListItem) {
    return item.index;
  }

  onPersonNameChange(index: number, value: string) {
    if (!this.involvedPeople[index]) return;
    this.involvedPeople[index].name = value;
    if (this.submitted) this.validate();
  }

  onPersonAgeChange(index: number, value: string) {
    if (!this.involvedPeople[index]) return;
    const trimmed = this.normalizeText(value);
    if (!trimmed) {
      this.involvedPeople[index].age = '';
      if (this.submitted) this.validate();
      return;
    }
    if (!/^\d{0,3}$/.test(trimmed)) {
      return;
    }
    const numeric = Number(trimmed);
    this.involvedPeople[index].age = numeric > 120 ? '120' : trimmed;
    if (this.submitted) this.validate();
  }

  getPersonNameError(index: number) {
    const person = this.involvedPeople[index];
    if (!person) return '';
    const name = this.normalizeText(person.name);
    const letters = name.replace(/\s/g, '').length;
    const nameRegex = /^[A-Za-z ]+$/;
    if (!name) return 'Name is required.';
    if (letters < 3 || letters > 20 || !nameRegex.test(name)) {
      return 'Name must be 3-20 letters (alphabets and spaces only).';
    }
    return '';
  }

  getPersonAgeError(index: number) {
    const person = this.involvedPeople[index];
    if (!person) return '';
    const ageText = this.normalizeText(person.age);
    if (!ageText) return '';
    if (!/^\d{1,3}$/.test(ageText) || Number(ageText) > 120) {
      return 'Age must be between 0 and 120.';
    }
    return '';
  }

  getEvidenceError(index: number, field: keyof EvidenceFieldErrors) {
    return this.evidenceErrors[index]?.[field] || '';
  }

  private buildPeoplePayload() {
    const grouped: {
      suspects: Array<{ name: string; age: number | null }>;
      victim: Array<{ name: string; age: number | null }>;
    } = {
      suspects: [],
      victim: [],
    };

    for (const person of this.involvedPeople) {
      const name = this.normalizeText(person.name);
      const age = this.normalizeText(person.age);
      const role = person.role;
      if (!name || !role) continue;
      grouped[role].push({ name, age: age ? Number(age) : null });
    }

    return grouped;
  }

  addEvidence() {
    this.evidence.push(this.createEvidenceGroup());
    if (this.submitted) this.validate();
  }

  removeEvidence(index: number) {
    if (this.evidence.length <= 1) return;
    this.evidence.removeAt(index);
    if (this.submitted) this.validate();
  }

  onFileChange(index: number, event: Event) {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] || null;
    this.evidence.at(index).get('evidence_file')?.setValue(file);
    if (this.submitted) this.validate();
  }

  clearEvidenceFile(index: number, input?: HTMLInputElement | null) {
    this.evidence.at(index).get('evidence_file')?.setValue(null);
    if (input) {
      input.value = '';
    }
    if (this.submitted) this.validate();
  }

  evidenceFileLabel(index: number): string {
    const file = this.evidence.at(index).get('evidence_file')?.value as File | null;
    if (!file) return '';
    return `${file.name} (${formatFileSize(file.size)})`;
  }

  private validate() {
    const data = this.form.getRawValue();
    const errs: CitizenSubmitErrors = {};
    const nameRegex = /^[A-Za-z ]+$/;
    const evidenceErrs: EvidenceFieldErrors[] = this.evidence.controls.map(() => ({}));

    if (!data.case_type.trim()) {
      errs.case_type = 'Case type is required.';
    }
    if (data.case_description.trim().length < 20) {
      errs.case_description = 'Case description must be at least 20 characters.';
    }
    if (!data.case_date) {
      errs.case_date = 'Case date is required.';
    } else if (data.case_date > this.todayStr) {
      errs.case_date = 'Case date cannot be in the future.';
    }

    for (const person of this.involvedPeople) {
      const name = this.normalizeText(person.name);
      const ageText = this.normalizeText(person.age);
      const role = person.role;
      const letters = name.replace(/\s/g, '').length;
      if (!role || !name || letters < 3 || letters > 20 || !nameRegex.test(name)) {
        errs.involvedPeople = 'Fix invalid suspect/victim name fields below.';
        break;
      }
      if (ageText && (!/^\d{1,3}$/.test(ageText) || Number(ageText) > 120)) {
        errs.involvedPeople = 'Fix invalid suspect/victim age fields below.';
        break;
      }
    }

    const evidenceRows = this.evidence.controls.map((group) => ({
      evidence_name: String(group.get('evidence_name')?.value || '').trim(),
      evidence_file: group.get('evidence_file')?.value as File | null,
    }));
    evidenceRows.forEach((row, index) => {
      const hasName = !!row.evidence_name;
      const hasFile = !!row.evidence_file;
      if (!hasName && !hasFile) return;

      if (!hasName) {
        evidenceErrs[index].evidence_name = 'Evidence name is required when evidence file is selected.';
      }
      if (!hasFile) {
        evidenceErrs[index].evidence_file = 'Evidence file is required when evidence name is entered.';
      }
      if (hasFile) {
        const mime = String(row.evidence_file?.type || '').toLowerCase();
        if (!isAllowedEvidenceType(mime)) {
          evidenceErrs[index].evidence_file = 'Evidence file must be an image or video.';
        } else if ((row.evidence_file?.size || 0) > MAX_EVIDENCE_FILE_SIZE_BYTES) {
          evidenceErrs[index].evidence_file = `Evidence file must be ${MAX_EVIDENCE_FILE_SIZE_MB} MB or smaller.`;
        }
      }
    });

    if (evidenceErrs.some((item) => item.evidence_name || item.evidence_file)) {
      errs.evidence = 'Fix evidence field errors below.';
    }

    this.errors = errs;
    this.evidenceErrors = evidenceErrs;
    return Object.keys(errs).length === 0;
  }

  async onSubmit() {
    this.submitted = true;
    if (!this.validate()) return;

    const data = this.form.getRawValue();
    const peoplePayload = this.buildPeoplePayload();

    const evidenceRows = this.evidence.controls.map((group) => ({
      evidence_name: String(group.get('evidence_name')?.value || '').trim(),
      evidence_file: group.get('evidence_file')?.value as File | null,
    }));
    const filledEvidenceRows = evidenceRows.filter((row) => row.evidence_name || row.evidence_file);

    const formData = new FormData();
    formData.append('case_type', data.case_type.trim());
    formData.append('case_description', data.case_description.trim());
    formData.append('case_date', data.case_date);
    formData.append(
      'suspect',
      peoplePayload.suspects.map((person) => person.name).join(', ')
    );
    formData.append(
      'victim',
      peoplePayload.victim.map((person) => person.name).join(', ')
    );
    formData.append('suspects_json', JSON.stringify(peoplePayload.suspects));
    formData.append('victim_json', JSON.stringify(peoplePayload.victim));

    for (const evidence of filledEvidenceRows) {
      if (!evidence.evidence_file) continue;
      formData.append('evidence_names', evidence.evidence_name);
      formData.append('evidence_files', evidence.evidence_file);
    }

    this.loading = true;
    try {
      await firstValueFrom(this.caseService.submitCitizenCase(formData));
      this.feedback.showMessage('Citizen case submitted successfully.', 'success');
      this.form.reset({
        case_type: '',
        case_description: '',
        case_date: '',
      });
      this.form.setControl('evidence', this.fb.array([this.createEvidenceGroup()]));
      this.involvedPeople = [];
      this.submitted = false;
      this.errors = {};
      this.evidenceErrors = [];
    } catch (err: any) {
      this.feedback.showError(err?.error?.msg || 'Failed to submit citizen case.');
    } finally {
      this.loading = false;
    }
  }

  private createEvidenceGroup() {
    return this.fb.group({
      evidence_name: this.fb.nonNullable.control(''),
      evidence_file: this.fb.control<File | null>(null),
    });
  }
}
