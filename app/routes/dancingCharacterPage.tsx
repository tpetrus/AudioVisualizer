import { DancingCharacterPage } from "~/features/visualizers/dancing-character/DancingCharacterPage";
import type { Route } from "../+types/root";

export function meta(_args: Route.MetaArgs) {
  return [{ title: "Audio Visualizer - Dancing Character" }, { name: "description", content: "" }];
}

export default function DancingCharacter() {
  return <DancingCharacterPage />;
}
