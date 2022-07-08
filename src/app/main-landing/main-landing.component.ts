import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AudioService } from '../services/audio.service';

@Component({
  selector: 'app-main-landing',
  templateUrl: './main-landing.component.html',
  styleUrls: ['./main-landing.component.scss']
})
export class MainLandingComponent  {
  public readonly BASIC_COLOR_WAVE_URL = "assets/visualization-images/basic-color-wave.png";
  public _router: Router;
  public audio!: AnalyserNode;
  public frequencyData!: Uint8Array;
  public titleSize: string = '25%';

  public onVisualizationClick(pageUrl: string) {
    this._router.navigateByUrl(pageUrl);
  }

  public initializeAudio() {
    this.audio.fftSize = 32;
    this.audio.smoothingTimeConstant = 0;
    var bufferLength = this.audio.frequencyBinCount;
    this.frequencyData = new Uint8Array(bufferLength);
    this.audio.getByteFrequencyData(this.frequencyData);
  }

  public updateFrequencyValues() {
    this.audio.getByteFrequencyData(this.frequencyData);
  }

  public updateTitleSize() {
    this.titleSize = 25 + this.frequencyData[0]/100 + "%";
  }

  constructor(router: Router, audioService: AudioService) {
    this._router = router;
    audioService.getAnalyser().subscribe(async analyser => {
      if(analyser) {
          this.audio = analyser;
          this.initializeAudio();
          const wait = (ms:number) => new Promise(resolve => setTimeout(resolve, ms))
          // while(true) {
          //   this.updateFrequencyValues();
          //   this.updateTitleSize();
          //   await wait(1);
          // };
      }
    });
  }
}
