import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ActiveUsers } from './active-users';

describe('ActiveUsers', () => {
  let component: ActiveUsers;
  let fixture: ComponentFixture<ActiveUsers>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ActiveUsers]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ActiveUsers);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
