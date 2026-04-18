import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminRemovedCases } from './admin-removed-cases';

describe('AdminRemovedCases', () => {
  let component: AdminRemovedCases;
  let fixture: ComponentFixture<AdminRemovedCases>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminRemovedCases]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminRemovedCases);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
