import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PendingUpdates } from './pending-updates';

describe('PendingUpdates', () => {
  let component: PendingUpdates;
  let fixture: ComponentFixture<PendingUpdates>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PendingUpdates]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PendingUpdates);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
