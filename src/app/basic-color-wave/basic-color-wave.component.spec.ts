import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BasicColorWaveComponent } from './basic-color-wave.component';

describe('PolyhedronComponent', () => {
  let component: BasicColorWaveComponent;
  let fixture: ComponentFixture<BasicColorWaveComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ BasicColorWaveComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(BasicColorWaveComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
