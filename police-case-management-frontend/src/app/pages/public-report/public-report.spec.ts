import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PublicReport } from './public-report';

describe('PublicReport', () => {
  let component: PublicReport;
  let fixture: ComponentFixture<PublicReport>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PublicReport]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PublicReport);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
