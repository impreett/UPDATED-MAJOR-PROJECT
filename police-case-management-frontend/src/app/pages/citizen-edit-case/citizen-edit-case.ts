import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AppFeedbackService } from '../../services/app-feedback.service';
import { CaseService } from '../../services/case';
import { toAbsoluteAssetUrl } from '../../utils/asset-url';
import {
  buildExistingEvidencePayload,
  buildNewEvidenceUploadPayload,
  createEmptyEvidenceEntry,
  formatFileSize,
  parseEvidenceEntries,
  EvidenceEditorEntry,
  EvidenceFieldErrors,
  validateEvidenceEntries,
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

type CitizenEditErrors = {
  case_type?: string;
  case_description?: string;
  case_date?: string;
  involvedPeople?: string;
  evidence?: string;
};

@Component({
  selector: 'app-citizen-edit-case',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './citizen-edit-case.html',
  styleUrl: './citizen-edit-case.css',
})
export class CitizenEditCase implements OnInit {
  private readonly fb = inject(FormBuilder);
  id = '';
  loading = true;
  submitting = false;
  error = '';
  caseItem: any = null;
  involvedPeople: InvolvedPerson[] = [];
  evidenceEntries: EvidenceEditorEntry[] = [createEmptyEvidenceEntry()];
  evidenceErrors: EvidenceFieldErrors[] = [];
  errors: CitizenEditErrors = {};
  todayStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];

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
  });

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private caseService: CaseService,
    private feedback: AppFeedbackService
  ) {}

  async ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id') || '';
    if (!this.id) {
      this.error = 'Invalid case id.';
      this.loading = false;
      return;
    }

    try {
      const caseItem = await firstValueFrom(this.caseService.getCitizenCaseForEdit(this.id));
      this.caseItem = caseItem;
      this.form.patchValue({
        case_type: caseItem?.case_type || '',
        case_description: caseItem?.case_description || '',
        case_date: caseItem?.case_date ? new Date(caseItem.case_date).toISOString().split('T')[0] : '',
      });
      this.involvedPeople = [
        ...this.parsePeopleField(caseItem?.suspects, 'suspects'),
        ...this.parsePeopleField(caseItem?.victim, 'victim'),
      ];
      this.evidenceEntries = parseEvidenceEntries(caseItem?.evidence);
      if (!this.evidenceEntries.length) {
        this.evidenceEntries = [createEmptyEvidenceEntry()];
      }
    } catch (err: any) {
      this.error = err?.error?.msg || 'Failed to load case for editing.';
    } finally {
      this.loading = false;
    }
  }

  private normalizeText(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
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
    this.involvedPeople.push({ name: '', age: '', role });
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

  evidenceFileLabel(entry: EvidenceEditorEntry): string {
    if (!entry?.evidence_file) return '';
    return `${entry.evidence_file.name} (${formatFileSize(entry.evidence_file.size)})`;
  }

  getEvidenceError(index: number, field: keyof EvidenceFieldErrors) {
    return this.evidenceErrors[index]?.[field] || '';
  }

  evidenceLink(entry: EvidenceEditorEntry): string {
    return toAbsoluteAssetUrl(entry.existing_file_url);
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
      const ageText = this.normalizeText(person.age);
      const role = person.role;
      if (!name || !role) continue;
      grouped[role].push({
        name,
        age: ageText ? Number(ageText) : null,
      });
    }

    return grouped;
  }

  private validate() {
    const formData = this.form.getRawValue();
    const errs: CitizenEditErrors = {};
    const nameRegex = /^[A-Za-z ]+$/;

    if (!formData.case_type) {
      errs.case_type = 'Please select a case type.';
    }
    if (!formData.case_description || formData.case_description.length < 20) {
      errs.case_description = !formData.case_description
        ? 'Please provide a description.'
        : 'Description must be at least 20 characters.';
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

    const evidenceValidation = validateEvidenceEntries(this.evidenceEntries);
    this.evidenceErrors = evidenceValidation.errors;
    if (evidenceValidation.hasErrors) {
      errs.evidence = 'Fix evidence field errors below.';
    }

    this.errors = errs;
    return Object.keys(errs).length === 0;
  }

  async onSubmit() {
    if (!this.validate() || this.submitting) return;

    this.submitting = true;
    try {
      const formData = this.form.getRawValue();
      const peoplePayload = this.buildPeoplePayload();
      const payload = new FormData();
      payload.append('case_type', formData.case_type);
      payload.append('case_description', formData.case_description);
      payload.append('case_date', formData.case_date);
      payload.append('suspects_json', JSON.stringify(peoplePayload.suspects));
      payload.append('victim_json', JSON.stringify(peoplePayload.victim));
      payload.append(
        'existing_evidence_json',
        JSON.stringify(buildExistingEvidencePayload(this.evidenceEntries))
      );
      for (const evidence of buildNewEvidenceUploadPayload(this.evidenceEntries)) {
        payload.append('evidence_names', evidence.evidence_name);
        payload.append('evidence_files', evidence.evidence_file);
      }

      await firstValueFrom(this.caseService.updateCitizenCase(this.id, payload));
      this.feedback.showMessage('Case updated successfully.', 'success');
      this.router.navigate(['/citizen/case-status']);
    } catch (err: any) {
      this.feedback.showError(err?.error?.msg || 'Failed to update case.');
    } finally {
      this.submitting = false;
    }
  }
}
