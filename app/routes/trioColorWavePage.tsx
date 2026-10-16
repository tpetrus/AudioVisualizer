import { TrioColorWavePage } from "~/features/visualizers/trio-color-wave/TrioColorWavePage";
import type { Route } from "../+types/root";

export function meta({ }: Route.MetaArgs) {
  return [
    { title: "Audio Visualizer - Trio Color Wave" },
    { name: "description", content: "" },
  ];
}

export default function TrioColorWave() {
  return <TrioColorWavePage />;
}
