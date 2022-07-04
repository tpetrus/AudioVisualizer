import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PolyhedronComponent } from './visual-3.component';

describe('PolyhedronComponent', () => {
  let component: PolyhedronComponent;
  let fixture: ComponentFixture<PolyhedronComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ PolyhedronComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(PolyhedronComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
