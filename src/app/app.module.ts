import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { BasicColorWaveComponent } from './basic-color-wave/basic-color-wave.component';
import { AudioService } from './services/audio.service';
import { MainLandingComponent } from './main-landing/main-landing.component';
import { CubesComponent } from './cubes/cubes.component';
import { ControlPanelComponent } from './control-panel/control-panel.component';
import { AudioSourceDialogComponent } from './audio-source-dialog/audio-source-dialog.component';

@NgModule({
  declarations: [
    AppComponent,
    BasicColorWaveComponent,
    CubesComponent,
    ControlPanelComponent,
    AudioSourceDialogComponent,
    MainLandingComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule
  ],
  providers: [
    AudioService
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
