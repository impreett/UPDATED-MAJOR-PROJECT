import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PendingUsers } from './pending-users';

describe('PendingUsers', () => {
  let component: PendingUsers;
  let fixture: ComponentFixture<PendingUsers>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PendingUsers]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PendingUsers);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
