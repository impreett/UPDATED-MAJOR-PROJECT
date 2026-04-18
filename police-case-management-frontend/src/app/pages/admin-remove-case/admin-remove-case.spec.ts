import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminRemoveCase } from './admin-remove-case';

describe('AdminRemoveCase', () => {
  let component: AdminRemoveCase;
  let fixture: ComponentFixture<AdminRemoveCase>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminRemoveCase]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminRemoveCase);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
