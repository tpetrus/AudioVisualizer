import { BassInkPage } from "~/features/visualizers/bass-ink/BassInkPage";
import type { Route } from "../+types/root";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Audio Visualizer - Bass ink" }, { name: "description", content: "" }];
}

export default function BassInk() {
  return <BassInkPage />;
}
