import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AudioSelectionComponent } from './audio-selection.component';

describe('AudioSelectionComponent', () => {
  let component: AudioSelectionComponent;
  let fixture: ComponentFixture<AudioSelectionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ AudioSelectionComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(AudioSelectionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
