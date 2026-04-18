import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PendingCases } from './pending-cases';

describe('PendingCases', () => {
  let component: PendingCases;
  let fixture: ComponentFixture<PendingCases>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PendingCases]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PendingCases);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
