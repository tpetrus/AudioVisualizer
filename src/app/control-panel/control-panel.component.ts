import { Component, Input, OnChanges } from "@angular/core";

export interface VisualizerControl {
  key: string;
  label: string;
  type: 'range' | 'checkbox' | 'color';
  value: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
}

@Component({
  selector: 'app-control-panel',
  templateUrl: './control-panel.component.html',
  styleUrls: ['./control-panel.component.scss'] 
})
export class ControlPanelComponent implements OnChanges {
  @Input() controls: VisualizerControl[] = [];
  public collapsed = true;
  private defaults = new Map<string, VisualizerControl['value']>();

  public asInput(event: Event): HTMLInputElement {
    return event.target as HTMLInputElement;
  }

  public reset(): void {
    this.controls.forEach(control => {
      if (!this.defaults.has(control.key)) {
        return;
      }
      control.value = this.defaults.get(control.key)!;
    });
  }

  ngOnChanges(): void {
    this.controls.forEach(c => { if (!this.defaults.has(c.key)) { this.defaults.set(c.key, c.value); } });
  }
}
