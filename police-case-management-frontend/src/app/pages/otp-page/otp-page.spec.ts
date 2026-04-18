import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OtpPage } from './otp-page';

describe('OtpPage', () => {
  let component: OtpPage;
  let fixture: ComponentFixture<OtpPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OtpPage]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OtpPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
