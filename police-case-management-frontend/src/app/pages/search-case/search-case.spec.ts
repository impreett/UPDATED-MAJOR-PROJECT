import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SearchCase } from './search-case';

describe('SearchCase', () => {
  let component: SearchCase;
  let fixture: ComponentFixture<SearchCase>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SearchCase]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SearchCase);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
