import { CubesPage } from "~/features/visualizers/cubes/CubesPage";
import type { Route } from "../+types/root";

export function meta({ }: Route.MetaArgs) {
  return [
    { title: "Audio Visualizer - Cubes" },
    { name: "description", content: "" },
  ];
}

export default function Cubes() {
  return <CubesPage />;
}
