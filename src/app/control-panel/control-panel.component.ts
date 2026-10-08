import { Component, Input, OnChanges } from "@angular/core";

export interface VisualizerControl {
  key: string;
  label: string;
  type: 'range' | 'checkbox' | 'color';
  value: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  // Controls with the same section are shown together under a collapsible heading, in order of first appearance.
  section?: string;
}

interface ControlSection {
  name: string;
  controls: VisualizerControl[];
}

@Component({
  selector: 'app-control-panel',
  templateUrl: './control-panel.component.html',
  styleUrls: ['./control-panel.component.scss']
})
export class ControlPanelComponent implements OnChanges {
  @Input() controls: VisualizerControl[] = [];
  public collapsed = true;
  public audioDialogOpen = false;
  public showStats = false;
  public sections: ControlSection[] = [];
  private defaults = new Map<string, VisualizerControl['value']>();
  private openSections = new Set<string>();

  public asInput(event: Event): HTMLInputElement {
    return event.target as HTMLInputElement;
  }

  public isModified(control: VisualizerControl): boolean {
    return this.defaults.has(control.key) && control.value !== this.defaults.get(control.key);
  }

  public resetControl(control: VisualizerControl): void {
    if (this.defaults.has(control.key)) {
      control.value = this.defaults.get(control.key)!;
    }
  }

  public modifiedCount(section: ControlSection): number {
    return section.controls.filter(control => this.isModified(control)).length;
  }

  // Resets every control.
  public reset(): void {
    this.controls.forEach(control => this.resetControl(control));
  }

  public isOpen(section: ControlSection): boolean {
    return this.openSections.has(section.name);
  }

  public onToggle(section: ControlSection, event: Event): void {
    if ((event.target as HTMLDetailsElement).open) {
      this.openSections.add(section.name);
    } else {
      this.openSections.delete(section.name);
    }
  }

  ngOnChanges(): void {
    this.controls.forEach(c => { if (!this.defaults.has(c.key)) { this.defaults.set(c.key, c.value); } });

    const sections = new Map<string, ControlSection>();
    this.controls.forEach(control => {
      const name = control.section ?? 'Settings';
      if (!sections.has(name)) {
        sections.set(name, { name, controls: [] });
      }
      sections.get(name)!.controls.push(control);
    });
    this.sections = [...sections.values()];

    // Start with just the first section open so the panel stays short.
    if (!this.openSections.size && this.sections.length) {
      this.openSections.add(this.sections[0].name);
    }
  }
}
