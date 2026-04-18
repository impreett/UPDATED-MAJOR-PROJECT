import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReportIssue } from './report-issue';

describe('ReportIssue', () => {
  let component: ReportIssue;
  let fixture: ComponentFixture<ReportIssue>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReportIssue]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReportIssue);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
