import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminUpdateForm } from './admin-update-form';

describe('AdminUpdateForm', () => {
  let component: AdminUpdateForm;
  let fixture: ComponentFixture<AdminUpdateForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminUpdateForm]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminUpdateForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
