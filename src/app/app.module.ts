import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { PolyhedronComponent } from './polyhedron/polyhedron.component';
import { AudioService } from './services/audio.service';
import { AudioSelectionComponent } from './audio-selection/audio-selection.component';

@NgModule({
  declarations: [
    AppComponent,
    PolyhedronComponent,
    AudioSelectionComponent
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
