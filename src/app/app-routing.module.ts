import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MainComponent } from './main/main.component';
import { PolyhedronComponent } from './polyhedron/polyhedron.component';

const routes: Routes = [
  {
    path: 'cubes',
    component: MainComponent
  },
  {
    path: '**',
    component: PolyhedronComponent
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
