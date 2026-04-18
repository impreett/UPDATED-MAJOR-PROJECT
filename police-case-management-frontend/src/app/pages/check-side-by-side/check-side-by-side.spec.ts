import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CheckSideBySide } from './check-side-by-side';

describe('CheckSideBySide', () => {
  let component: CheckSideBySide;
  let fixture: ComponentFixture<CheckSideBySide>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CheckSideBySide]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CheckSideBySide);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
