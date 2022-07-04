import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CubesComponent } from './cubes/cubes.component';
import { BasicColorWaveComponent } from './basic-color-wave/basic-color-wave.component';
import { Visual3Component } from './visual-3/visual-3.component';
import { MainLandingComponent } from './main-landing/main-landing.component';

const routes: Routes = [
  {
    path: 'cubes',
    component: CubesComponent
  },
  {
    path: 'visual3',
    component: Visual3Component
  },
  {
    path: 'basic-color-wave',
    component: BasicColorWaveComponent
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
