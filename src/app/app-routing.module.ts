import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CubesComponent } from './cubes/cubes.component';
import { BasicColorWaveComponent } from './basic-color-wave/basic-color-wave.component';
import { Visual3Component } from './visual-3/visual-3.component';
import { MainLandingComponent } from './main-landing/main-landing.component';
import { AudioCaptureGuard } from './services/audio-capture.guard';

const routes: Routes = [
  {
    path: 'cubes',
    component: CubesComponent,
    canActivate: [AudioCaptureGuard]
  },
  {
    path: 'visual3',
    component: Visual3Component,
    canActivate: [AudioCaptureGuard]
  },
  {
    path: 'basic-color-wave',
    component: BasicColorWaveComponent,
    canActivate: [AudioCaptureGuard]
  },
  {
    path: '**',
    component: MainLandingComponent
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
