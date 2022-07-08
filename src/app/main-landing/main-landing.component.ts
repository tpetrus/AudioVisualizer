import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-main-landing',
  templateUrl: './main-landing.component.html',
  styleUrls: ['./main-landing.component.scss']
})
export class MainLandingComponent  {
  public readonly BASIC_COLOR_WAVE_URL = "assets/visualization-images/basic-color-wave.png";
  public _router: Router;

  constructor(router: Router) { 
    this._router = router;
  }

  public onVisualizationClick(pageUrl: string) {
    this._router.navigateByUrl(pageUrl);
  }
}
