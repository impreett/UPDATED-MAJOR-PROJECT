import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewReports } from './view-reports';

describe('ViewReports', () => {
  let component: ViewReports;
  let fixture: ComponentFixture<ViewReports>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ViewReports]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ViewReports);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
