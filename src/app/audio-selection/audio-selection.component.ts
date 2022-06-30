import { Component } from '@angular/core';
import { AudioService } from '../services/audio.service';

@Component({
  selector: 'app-audio-selection',
  templateUrl: './audio-selection.component.html',
  styleUrls: ['./audio-selection.component.scss']
})
export class AudioSelectionComponent {

  constructor(_audioService: AudioService) {
    _audioService.getAnalyser().subscribe()
  }

}
