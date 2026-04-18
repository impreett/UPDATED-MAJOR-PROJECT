import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddCase } from './add-case';

describe('AddCase', () => {
  let component: AddCase;
  let fixture: ComponentFixture<AddCase>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddCase]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddCase);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
