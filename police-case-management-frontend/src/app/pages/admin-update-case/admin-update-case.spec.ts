import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminUpdateCase } from './admin-update-case';

describe('AdminUpdateCase', () => {
  let component: AdminUpdateCase;
  let fixture: ComponentFixture<AdminUpdateCase>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminUpdateCase]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminUpdateCase);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
