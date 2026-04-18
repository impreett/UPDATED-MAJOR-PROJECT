import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UpdateCaseList } from './update-case-list';

describe('UpdateCaseList', () => {
  let component: UpdateCaseList;
  let fixture: ComponentFixture<UpdateCaseList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UpdateCaseList]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UpdateCaseList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
