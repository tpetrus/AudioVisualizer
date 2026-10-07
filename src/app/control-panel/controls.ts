import { VisualizerControl } from "./control-panel.component";

export function controlValue<T extends number | boolean | string>(controls: VisualizerControl[], key: string): T {
  return controls.find(c => c.key === key)!.value as T;
}
